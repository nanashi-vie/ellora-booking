package com.bookingnailms;

import com.bookingnailms.entity.*;
import com.bookingnailms.enums.BookingStatus;
import com.bookingnailms.dto.booking.BookingStatusUpdateRequest;
import com.bookingnailms.repository.*;
import com.bookingnailms.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.mail.MailSendException;
import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.LocalDateTime;
import java.time.Instant;
import java.time.Clock;
import java.time.ZoneOffset;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BookingNotificationTest {
    @Test void sendsPlainTextAndHtmlAlternatives() throws Exception {
        BookingEmailRepository repository = mock(BookingEmailRepository.class);
        JavaMailSender sender = mock(JavaMailSender.class);
        BookingEmailService service = new BookingEmailService(repository, sender, mock(BookingRepository.class));
        ReflectionTestUtils.setField(service, "enabled", true);
        ReflectionTestUtils.setField(service, "from", "sender@example.com");
        BookingEmail email = new BookingEmail();
        email.setRecipient("salon@example.com"); email.setSubject("Ellora - Nhắc phí");
        email.setKind("BILLING_REMINDER"); email.setBody("Số tiền: 100000 VNĐ");
        when(repository.lockDueEmails()).thenReturn(List.of(email));
        MimeMessage message = new MimeMessage((Session) null);
        when(sender.createMimeMessage()).thenReturn(message);
        service.deliver();
        verify(sender).send(message);
        message.saveChanges();
        var output = new java.io.ByteArrayOutputStream();
        message.writeTo(output);
        String mime = output.toString(java.nio.charset.StandardCharsets.UTF_8);
        assertTrue(mime.contains("multipart/alternative"));
        assertTrue(java.util.regex.Pattern.compile("text/plain;\\s*charset=UTF-8", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(mime).find());
        assertTrue(java.util.regex.Pattern.compile("text/html;\\s*charset=UTF-8", java.util.regex.Pattern.CASE_INSENSITIVE).matcher(mime).find());
        assertNotNull(email.getSentAt());
    }

    @Test void newBookingQueuesShopEmailAndOtherOwnersCannotConfirm() {
        Booking booking = booking();
        booking.getSalon().setStatus(com.bookingnailms.enums.SalonStatus.ACTIVE);
        booking.getService().setSalon(booking.getSalon());
        booking.getService().setActive(true);
        BookingRepository repository = mock(BookingRepository.class);
        SalonRepository salons = mock(SalonRepository.class);
        NailServiceRepository services = mock(NailServiceRepository.class);
        EmployeeRepository employeeRepository = mock(EmployeeRepository.class);
        UserRepository users = mock(UserRepository.class);
        BookingEmailService emails = mock(BookingEmailService.class);
        when(users.findById(booking.getCustomer().getId())).thenReturn(Optional.of(booking.getCustomer()));
        when(salons.findForUpdateById(2L)).thenReturn(Optional.of(booking.getSalon()));
        when(services.findById(3L)).thenReturn(Optional.of(booking.getService()));
        when(repository.findOverlapping(any(), any(), any())).thenReturn(List.of());
        when(employeeRepository.findBySalonIdAndActiveTrue(2L)).thenReturn(List.of(
                Employee.builder().id(4L).salon(booking.getSalon()).active(true).build()));
        when(repository.save(any())).thenReturn(booking);
        BookingService service = new BookingService(repository, salons, services, employeeRepository, users, emails, null,
                Clock.fixed(Instant.parse("2026-10-01T00:00:00Z"), ZoneOffset.UTC));
        var request = new com.bookingnailms.dto.booking.BookingRequest(2L, 3L, null, booking.getScheduledAt(), null);
        service.createBooking(request, booking.getCustomer().getId());
        verify(emails).enqueue(booking, false);
        when(repository.findForUpdateById(1L)).thenReturn(Optional.of(booking));
        BookingStatusUpdateRequest confirm = new BookingStatusUpdateRequest(); confirm.setStatus(BookingStatus.CONFIRMED);
        assertThrows(com.bookingnailms.exception.UnauthorizedException.class, () -> service.updateBookingStatus(1L, confirm, UUID.randomUUID()));
        verifyNoMoreInteractions(emails);
    }
    private Booking booking() {
        User owner = User.builder().id(UUID.randomUUID()).email("owner@example.com").build();
        User customer = User.builder().id(UUID.randomUUID()).email("customer@example.com").fullName("Khách hàng").build();
        Salon salon = Salon.builder().id(2L).owner(owner).name("Tiệm thử").build();
        NailService service = NailService.builder().id(3L).name("Sơn gel").durationMinutes(30).build();
        return Booking.builder().id(1L).salon(salon).customer(customer).service(service)
                .status(BookingStatus.PENDING).scheduledAt(LocalDateTime.of(2026, 10, 1, 9, 30)).build();
    }

    @Test void routesNewBookingToSalonAndConfirmationToCustomer() {
        BookingEmailRepository repository = mock(BookingEmailRepository.class);
        BookingEmailService service = new BookingEmailService(repository, mock(JavaMailSender.class), mock(BookingRepository.class));
        Booking booking = booking();
        service.enqueue(booking, false);
        booking.getSalon().setEmail("salon@example.com");
        service.enqueue(booking, false);
        service.enqueue(booking, true);
        var captor = org.mockito.ArgumentCaptor.forClass(BookingEmail.class);
        verify(repository, times(3)).save(captor.capture());
        assertEquals(List.of("owner@example.com", "salon@example.com", "customer@example.com"),
                captor.getAllValues().stream().map(BookingEmail::getRecipient).toList());
        assertTrue(captor.getValue().getBody().contains("09:30 01/10/2026"));
        assertEquals("CONFIRMED", captor.getValue().getKind());
    }

    @Test void failedMailStaysQueuedAndCanSucceedOnRetry() {
        BookingEmailRepository repository = mock(BookingEmailRepository.class);
        JavaMailSender sender = mock(JavaMailSender.class);
        BookingEmailService service = new BookingEmailService(repository, sender, mock(BookingRepository.class));
        ReflectionTestUtils.setField(service, "enabled", true);
        ReflectionTestUtils.setField(service, "from", "sender@example.com");
        BookingEmail email = new BookingEmail(); email.setRecipient("customer@example.com");
        when(repository.lockDueEmails()).thenReturn(List.of(email));
        email.setSubject("Ellora"); email.setBody("Thông tin lịch hẹn"); email.setKind("CONFIRMED");
        when(sender.createMimeMessage()).thenAnswer(invocation -> new MimeMessage((Session) null));
        doThrow(new MailSendException("offline")).doNothing().when(sender).send(any(MimeMessage.class));
        service.deliver();
        assertNull(email.getSentAt()); assertEquals(1, email.getAttempts());
        assertTrue(email.getNextAttemptAt().isAfter(Instant.now()));
        service.deliver(); assertNotNull(email.getSentAt());
    }

    @Test void confirmationIsIdempotentAndCannotReconfirmCancelledBooking() {
        BookingRepository repository = mock(BookingRepository.class);
        BookingEmailService emails = mock(BookingEmailService.class);
        BookingService service = new BookingService(repository, mock(SalonRepository.class), mock(NailServiceRepository.class),
                mock(EmployeeRepository.class), mock(UserRepository.class), emails);
        Booking booking = booking();
        when(repository.findForUpdateById(1L)).thenReturn(Optional.of(booking));
        when(repository.save(booking)).thenReturn(booking);
        BookingStatusUpdateRequest request = new BookingStatusUpdateRequest(); request.setStatus(BookingStatus.CONFIRMED);
        UUID owner = booking.getSalon().getOwner().getId();
        service.updateBookingStatus(1L, request, owner);
        service.updateBookingStatus(1L, request, owner);
        verify(emails, times(1)).enqueue(booking, true);
        booking.setStatus(BookingStatus.CANCELLED);
        assertThrows(com.bookingnailms.exception.BadRequestException.class, () -> service.updateBookingStatus(1L, request, owner));
        verifyNoMoreInteractions(emails);
    }
}
