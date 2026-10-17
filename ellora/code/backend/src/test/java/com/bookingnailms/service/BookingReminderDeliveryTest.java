package com.bookingnailms.service;

import com.bookingnailms.entity.*;
import com.bookingnailms.enums.BookingStatus;
import com.bookingnailms.repository.BookingEmailRepository;
import com.bookingnailms.repository.BookingRepository;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BookingReminderDeliveryTest {
    private static final Instant NOW = Instant.parse("2026-10-18T01:00:00Z"); // 08:00 Vietnam
    private final BookingEmailRepository emails = mock(BookingEmailRepository.class);
    private final BookingRepository bookings = mock(BookingRepository.class);
    private final JavaMailSender sender = mock(JavaMailSender.class);
    private final Clock clock = mock(Clock.class);
    private final BookingEmailService service = new BookingEmailService(emails, sender, bookings, clock);

    BookingReminderDeliveryTest() {
        when(clock.instant()).thenReturn(NOW);
        ReflectionTestUtils.setField(service, "enabled", true);
        ReflectionTestUtils.setField(service, "from", "sender@example.com");
        when(sender.createMimeMessage()).thenAnswer(invocation -> new MimeMessage((Session) null));
    }

    private Booking booking() {
        return Booking.builder().id(1L).status(BookingStatus.CONFIRMED)
                .scheduledAt(LocalDateTime.of(2026, 10, 18, 9, 0))
                .customer(User.builder().email("current@example.com").fullName("Khách thử").build())
                .salon(Salon.builder().name("Tiệm <Ellora>").address("12 Đường A").phone("0900000000").build())
                .service(NailService.builder().name("Sơn gel").build()).build();
    }

    private BookingEmail queued(long id) {
        BookingEmail email = new BookingEmail();
        email.setId(id); email.setBookingId(id); email.setKind(BookingReminderService.KIND);
        email.setRecipient("old@example.com"); email.setSubject("Ellora - Nhắc lịch hẹn #" + id);
        email.setBody("Nội dung trước khi thay đổi lịch"); email.setNextAttemptAt(NOW);
        return email;
    }

    @Test void sendsCurrentDetailsAndRecipientInPlainTextAndEscapedHtml() throws Exception {
        BookingEmail email = queued(1L);
        when(emails.lockDueEmails()).thenReturn(List.of(email));
        when(bookings.findById(1L)).thenReturn(Optional.of(booking()));
        service.deliver();
        var captor = org.mockito.ArgumentCaptor.forClass(MimeMessage.class);
        verify(sender).send(captor.capture());
        MimeMessage message = captor.getValue();
        message.saveChanges();
        assertEquals("current@example.com", message.getAllRecipients()[0].toString());
        String plain = part(message, "text/plain");
        String html = part(message, "text/html");
        assertTrue(plain.contains("09:00 18/10/2026 (giờ Việt Nam)"));
        assertTrue(plain.contains("Sơn gel"));
        assertTrue(plain.contains("12 Đường A"));
        assertTrue(plain.contains("0900000000"));
        assertTrue(html.contains("Bạn có lịch hẹn sắp tới"));
        assertTrue(html.contains("Tiệm &lt;Ellora&gt;"));
        assertFalse(html.contains("Tiệm <Ellora>"));
        assertEquals(NOW, email.getSentAt());
        verify(emails, never()).delete(any());
    }

    @ParameterizedTest
    @EnumSource(value = BookingStatus.class, names = "CONFIRMED", mode = EnumSource.Mode.EXCLUDE)
    void discardsReminderAfterStatusChanges(BookingStatus status) {
        Booking booking = booking(); booking.setStatus(status);
        assertDiscarded(booking, queued(1L));
    }

    @Test void discardsDeletedBookingGuestMissingEmailAndMissingTime() {
        Booking guest = booking(); guest.setCustomer(null);
        Booking noEmail = booking(); noEmail.getCustomer().setEmail("  ");
        Booking noTime = booking(); noTime.setScheduledAt(null);
        for (Booking booking : Arrays.asList(null, guest, noEmail, noTime)) {
            assertDiscarded(booking, queued(1L));
        }
    }

    private void assertDiscarded(Booking booking, BookingEmail email) {
        clearInvocations(emails, sender);
        when(emails.lockDueEmails()).thenReturn(List.of(email));
        when(bookings.findById(1L)).thenReturn(Optional.ofNullable(booking));
        service.deliver();
        verify(emails).delete(email);
        verify(sender, never()).send(any(MimeMessage.class));
        assertNull(email.getSentAt());
        assertEquals(0, email.getAttempts());
    }

    @Test void discardsReminderAtOrAfterAppointmentStart() {
        for (int minutes : List.of(0, -1)) {
            Booking booking = booking(); booking.setScheduledAt(LocalDateTime.of(2026, 10, 18, 8, 0).plusMinutes(minutes));
            assertDiscarded(booking, queued(1L));
        }
    }

    @Test void rescheduledFutureReminderWaitsForNewReminderTime() {
        Booking booking = booking(); booking.setScheduledAt(LocalDateTime.of(2026, 10, 18, 10, 0));
        BookingEmail email = queued(1L);
        when(emails.lockDueEmails()).thenReturn(List.of(email));
        when(bookings.findById(1L)).thenReturn(Optional.of(booking));
        service.deliver();
        assertEquals(NOW.plusSeconds(3600), email.getNextAttemptAt());
        assertNull(email.getSentAt());
        verify(sender, never()).send(any(MimeMessage.class));
        verify(emails, never()).delete(any());
    }

    @Test void failedReminderRetriesAndSucceedsWhileStillUpcoming() {
        BookingEmail email = queued(1L);
        when(emails.lockDueEmails()).thenReturn(List.of(email));
        when(bookings.findById(1L)).thenReturn(Optional.of(booking()));
        doThrow(new MailSendException("offline")).doNothing().when(sender).send(any(MimeMessage.class));
        service.deliver();
        assertNull(email.getSentAt());
        assertEquals(1, email.getAttempts());
        assertEquals(NOW.plusSeconds(30), email.getNextAttemptAt());
        when(clock.instant()).thenReturn(NOW.plusSeconds(31));
        service.deliver();
        assertEquals(NOW.plusSeconds(31), email.getSentAt());
        verify(sender, times(2)).send(any(MimeMessage.class));
    }

    @Test void failedReminderIsDiscardedWhenRetryWouldBeAfterStart() {
        Booking booking = booking(); booking.setScheduledAt(LocalDateTime.of(2026, 10, 18, 8, 1));
        BookingEmail email = queued(1L);
        when(emails.lockDueEmails()).thenReturn(List.of(email));
        when(bookings.findById(1L)).thenReturn(Optional.of(booking));
        doThrow(new MailSendException("offline")).when(sender).send(any(MimeMessage.class));
        service.deliver();
        when(clock.instant()).thenReturn(NOW.plusSeconds(61));
        service.deliver();
        verify(sender, times(1)).send(any(MimeMessage.class));
        verify(emails).delete(email);
        assertNull(email.getSentAt());
    }

    @Test void checksFreshTimeForEachEmailAfterEarlierSmtpDelay() {
        Booking first = booking(); first.setScheduledAt(LocalDateTime.of(2026, 10, 18, 8, 1));
        Booking second = booking(); second.setId(2L); second.setScheduledAt(first.getScheduledAt());
        BookingEmail firstEmail = queued(1L), secondEmail = queued(2L);
        when(emails.lockDueEmails()).thenReturn(List.of(firstEmail, secondEmail));
        when(bookings.findById(1L)).thenReturn(Optional.of(first));
        when(bookings.findById(2L)).thenReturn(Optional.of(second));
        doAnswer(invocation -> { when(clock.instant()).thenReturn(NOW.plusSeconds(61)); return null; })
                .when(sender).send(any(MimeMessage.class));
        service.deliver();
        verify(sender, times(1)).send(any(MimeMessage.class));
        verify(emails).delete(secondEmail);
        assertNull(secondEmail.getSentAt());
    }

    @Test void mailDisabledOrMissingFromDoesNotReadOrSendTheQueue() {
        ReflectionTestUtils.setField(service, "enabled", false);
        service.deliver();
        ReflectionTestUtils.setField(service, "enabled", true);
        ReflectionTestUtils.setField(service, "from", " ");
        service.deliver();
        verifyNoInteractions(emails, bookings);
        verify(sender, never()).send(any(MimeMessage.class));
    }

    private static String part(Part part, String type) throws Exception {
        if (part.isMimeType(type)) return (String) part.getContent();
        if (part.getContent() instanceof Multipart multipart) {
            for (int i = 0; i < multipart.getCount(); i++) {
                String value = part(multipart.getBodyPart(i), type);
                if (!value.isEmpty()) return value;
            }
        }
        return "";
    }
}
