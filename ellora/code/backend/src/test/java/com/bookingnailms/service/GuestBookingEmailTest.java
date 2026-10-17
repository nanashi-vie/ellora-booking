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
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Pageable;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.*;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class GuestBookingEmailTest {
    private static final Instant NOW = Instant.parse("2026-10-18T01:00:00Z"); // 08:00 Vietnam
    private final BookingEmailRepository emails = mock(BookingEmailRepository.class);
    private final BookingRepository bookings = mock(BookingRepository.class);
    private final JavaMailSender sender = mock(JavaMailSender.class);
    private final BookingEmailService service = new BookingEmailService(emails, sender, bookings,
            Clock.fixed(NOW, ZoneOffset.UTC));

    private Booking guest(BookingStatus status) {
        return Booking.builder().id(7L).status(status).guestEmail("guest@example.test")
                .walkInName("Mai <Khách>").customerPhone("0901234567")
                .scheduledAt(LocalDateTime.of(2026, 10, 18, 9, 0)).durationMinutes(60)
                .salon(Salon.builder().id(1L).name("Ellora Nail").email("salon@example.test")
                        .address("12 Đường Hoa").phone("02812345678")
                        .owner(User.builder().email("owner@example.test").build()).build())
                .service(NailService.builder().name("Sơn gel").build()).build();
    }

    @Test void creatingAGuestBookingQueuesSeparateSalonNotificationAndGuestReceipt() {
        Booking booking = guest(BookingStatus.PENDING);
        service.enqueue(booking, false);
        service.enqueueGuestReceipt(booking);

        ArgumentCaptor<BookingEmail> queued = ArgumentCaptor.forClass(BookingEmail.class);
        verify(emails, times(2)).save(queued.capture());
        BookingEmail salon = queued.getAllValues().stream().filter(mail -> mail.getKind().equals("NEW_BOOKING"))
                .findFirst().orElseThrow();
        BookingEmail receipt = queued.getAllValues().stream().filter(mail -> mail.getKind().equals("BOOKING_RECEIVED"))
                .findFirst().orElseThrow();
        assertEquals("salon@example.test", salon.getRecipient());
        assertEquals("guest@example.test", receipt.getRecipient());
        for (BookingEmail mail : List.of(salon, receipt)) {
            assertEquals(7L, mail.getBookingId());
            assertFalse(mail.getSubject().isBlank());
            for (String detail : List.of("Ellora Nail", "Mai <Khách>", "Sơn gel", "09:00 18/10/2026")) {
                assertTrue(mail.getBody().contains(detail), "Missing " + detail + " in " + mail.getKind());
            }
        }
        assertTrue(receipt.getBody().contains("chờ tiệm xác nhận"));
        verifyNoInteractions(sender);
    }

    @Test void guestConfirmationIsAddressedToTheProvidedEmailWithoutACustomerProfile() {
        service.enqueue(guest(BookingStatus.CONFIRMED), true);
        ArgumentCaptor<BookingEmail> queued = ArgumentCaptor.forClass(BookingEmail.class);
        verify(emails).save(queued.capture());
        assertEquals("CONFIRMED", queued.getValue().getKind());
        assertEquals("guest@example.test", queued.getValue().getRecipient());
        assertTrue(queued.getValue().getBody().contains("Mai <Khách>"));
    }

    @Test void salonNotificationFallsBackToOwnerEmailWhenSalonEmailIsMissing() {
        Booking booking = guest(BookingStatus.PENDING);
        booking.getSalon().setEmail("  ");
        service.enqueue(booking, false);
        ArgumentCaptor<BookingEmail> queued = ArgumentCaptor.forClass(BookingEmail.class);
        verify(emails).save(queued.capture());
        assertEquals("owner@example.test", queued.getValue().getRecipient());
    }

    @Test void anOwnerWalkInWithoutAnEmailDoesNotQueueCustomerMailOrQualifyForAReminder() {
        Booking walkIn = guest(BookingStatus.CONFIRMED);
        walkIn.setGuestEmail(null);
        service.enqueue(walkIn, false);
        service.enqueue(walkIn, true);
        service.enqueueGuestReceipt(walkIn);
        assertNull(BookingReminderService.dueAt(walkIn));
        verifyNoInteractions(emails, sender);
    }

    @Test void scannerEnqueuesAConfirmedGuestsReminderAtOneHourUsingItsStoredContacts() {
        Booking booking = guest(BookingStatus.CONFIRMED);
        when(bookings.findReminderCandidates(any(), any(), any(Pageable.class))).thenReturn(List.of(booking));
        var reminders = new BookingReminderService(bookings, emails, Clock.fixed(NOW, ZoneOffset.UTC));
        ReflectionTestUtils.setField(reminders, "enabled", true);
        reminders.enqueueDueReminders();
        assertEquals(NOW, BookingReminderService.dueAt(booking));
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(emails).enqueueAppointmentReminder(eq(7L), eq("guest@example.test"), anyString(), body.capture(), eq(NOW));
        for (String detail : List.of("Mai <Khách>", "Ellora Nail", "Sơn gel", "09:00 18/10/2026",
                "12 Đường Hoa", "02812345678")) {
            assertTrue(body.getValue().contains(detail), "Missing guest reminder detail: " + detail);
        }
    }

    @Test void pendingCancelledOrExpiredGuestAppointmentsDoNotQualifyForReminders() {
        for (BookingStatus status : BookingStatus.values()) {
            assertEquals(status == BookingStatus.CONFIRMED,
                    BookingReminderService.eligible(guest(status), NOW), status.name());
        }
        Booking booking = guest(BookingStatus.CONFIRMED);
        assertFalse(BookingReminderService.eligible(booking, NOW.minusSeconds(1)));
        assertFalse(BookingReminderService.eligible(booking, NOW.plusSeconds(3600)));
        booking.setGuestEmail("  ");
        assertFalse(BookingReminderService.eligible(booking, NOW));
    }

    @Test void deliveryUsesGuestEmailAndEscapedHtmlWithoutAProfile() throws Exception {
        Booking booking = guest(BookingStatus.CONFIRMED);
        BookingEmail email = new BookingEmail();
        email.setId(10L); email.setBookingId(7L); email.setKind(BookingReminderService.KIND);
        email.setRecipient("old@example.test"); email.setSubject("Ellora - Nhắc lịch hẹn #7");
        email.setBody("Old details");
        when(emails.lockDueEmails()).thenReturn(List.of(email));
        when(bookings.findById(7L)).thenReturn(Optional.of(booking));
        when(sender.createMimeMessage()).thenAnswer(call -> new MimeMessage((Session) null));
        ReflectionTestUtils.setField(service, "enabled", true);
        ReflectionTestUtils.setField(service, "from", "sender@example.test");

        service.deliver();

        ArgumentCaptor<MimeMessage> sent = ArgumentCaptor.forClass(MimeMessage.class);
        verify(sender).send(sent.capture());
        MimeMessage message = sent.getValue();
        message.saveChanges();
        assertEquals("guest@example.test", message.getAllRecipients()[0].toString());
        assertTrue(part(message, "text/plain").contains("Mai <Khách>"));
        String html = part(message, "text/html");
        assertTrue(org.springframework.web.util.HtmlUtils.htmlUnescape(html).contains("Mai <Khách>"));
        assertTrue(html.contains("&lt;"));
        assertFalse(html.contains("<Khách>"));
        assertEquals(NOW, email.getSentAt());
        verify(emails, never()).delete(any());
    }

    @Test void aGuestReminderQueuedBeforeCancellationIsDiscardedBeforeSending() {
        BookingEmail email = new BookingEmail();
        email.setId(10L); email.setBookingId(7L); email.setKind(BookingReminderService.KIND);
        when(emails.lockDueEmails()).thenReturn(List.of(email));
        when(bookings.findById(7L)).thenReturn(Optional.of(guest(BookingStatus.CANCELLED)));
        ReflectionTestUtils.setField(service, "enabled", true);
        ReflectionTestUtils.setField(service, "from", "sender@example.test");
        service.deliver();
        verify(emails).delete(email);
        verifyNoInteractions(sender);
        assertNull(email.getSentAt());
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
