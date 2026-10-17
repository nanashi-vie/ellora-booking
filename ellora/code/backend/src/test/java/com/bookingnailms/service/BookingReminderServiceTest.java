package com.bookingnailms.service;

import com.bookingnailms.entity.Booking;
import com.bookingnailms.entity.NailService;
import com.bookingnailms.entity.Salon;
import com.bookingnailms.entity.User;
import com.bookingnailms.enums.BookingStatus;
import com.bookingnailms.enums.SalonStatus;
import com.bookingnailms.repository.BookingEmailRepository;
import com.bookingnailms.repository.BookingRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Pageable;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class BookingReminderServiceTest {
    private static final Instant NOW = Instant.parse("2026-12-31T16:30:00Z");
    private static final ZoneId VIETNAM = ZoneId.of("Asia/Ho_Chi_Minh");
    private static final LocalDateTime LOCAL_NOW = LocalDateTime.ofInstant(NOW, VIETNAM);

    private Booking booking(LocalDateTime scheduledAt) {
        User customer = User.builder().id(UUID.randomUUID()).fullName("Nguyễn Mai")
                .email("mai@example.test").build();
        Salon salon = Salon.builder().id(7L).name("Ellora Nail").status(SalonStatus.ACTIVE)
                .address("12 Đường Hoa").phone("02812345678").build();
        NailService nailService = NailService.builder().id(9L).name("Sơn gel").durationMinutes(60).build();
        return Booking.builder().id(41L).status(BookingStatus.CONFIRMED).customer(customer)
                .salon(salon).service(nailService).scheduledAt(scheduledAt).durationMinutes(60).build();
    }

    private BookingReminderService enabledService(BookingRepository bookings, BookingEmailRepository emails) {
        BookingReminderService service = new BookingReminderService(bookings, emails, Clock.fixed(NOW, ZoneOffset.UTC));
        ReflectionTestUtils.setField(service, "enabled", true);
        return service;
    }

    @Test void eligibilityIncludesTheOneHourBoundaryButNeverTheStartTimeOrPastAppointments() {
        assertTrue(BookingReminderService.eligible(booking(LOCAL_NOW.plusHours(1)), NOW));
        assertTrue(BookingReminderService.eligible(booking(LOCAL_NOW.plusSeconds(1)), NOW));
        assertFalse(BookingReminderService.eligible(booking(LOCAL_NOW.plusHours(1).plusSeconds(1)), NOW));
        assertFalse(BookingReminderService.eligible(booking(LOCAL_NOW), NOW));
        assertFalse(BookingReminderService.eligible(booking(LOCAL_NOW.minusSeconds(1)), NOW));
    }

    @Test void eligibilityUsesVietnamTimeAcrossMidnightAndTheNewYear() {
        assertEquals(LocalDateTime.of(2026, 12, 31, 23, 30), LOCAL_NOW);
        assertTrue(BookingReminderService.eligible(booking(LocalDateTime.of(2027, 1, 1, 0, 10)), NOW));
        assertTrue(BookingReminderService.eligible(booking(LocalDateTime.of(2027, 1, 1, 0, 30)), NOW));
        assertFalse(BookingReminderService.eligible(booking(LocalDateTime.of(2027, 1, 1, 0, 31)), NOW));
        assertEquals(Instant.parse("2026-12-31T16:10:00Z"),
                BookingReminderService.dueAt(booking(LocalDateTime.of(2027, 1, 1, 0, 10))));
    }

    @Test void onlyConfirmedOnlineAppointmentsWithAnEmailQualify() {
        Booking candidate = booking(LOCAL_NOW.plusMinutes(30));
        for (BookingStatus status : BookingStatus.values()) {
            candidate.setStatus(status);
            assertEquals(status == BookingStatus.CONFIRMED, BookingReminderService.eligible(candidate, NOW), status.name());
        }
        candidate.setStatus(BookingStatus.CONFIRMED);
        candidate.getCustomer().setEmail(null);
        assertFalse(BookingReminderService.eligible(candidate, NOW));
        candidate.getCustomer().setEmail("   ");
        assertFalse(BookingReminderService.eligible(candidate, NOW));
        candidate.setCustomer(null);
        assertFalse(BookingReminderService.eligible(candidate, NOW));
        candidate = booking(null);
        assertFalse(BookingReminderService.eligible(candidate, NOW));
    }

    @Test void disabledMailDoesNotScanOrEnqueueReminders() {
        BookingRepository bookings = mock(BookingRepository.class);
        BookingEmailRepository emails = mock(BookingEmailRepository.class);
        BookingReminderService service = enabledService(bookings, emails);
        ReflectionTestUtils.setField(service, "enabled", false);
        service.enqueueDueReminders();
        verifyNoInteractions(bookings, emails);
    }

    @Test void scansOneBoundedVietnamTimeWindowAndEnqueuesTheCustomersCurrentAppointmentDetails() {
        BookingRepository bookings = mock(BookingRepository.class);
        BookingEmailRepository emails = mock(BookingEmailRepository.class);
        Booking candidate = booking(LocalDateTime.of(2027, 1, 1, 0, 10));
        when(bookings.findReminderCandidates(any(), any(), any(Pageable.class))).thenReturn(List.of(candidate));
        enabledService(bookings, emails).enqueueDueReminders();

        ArgumentCaptor<Pageable> pagination = ArgumentCaptor.forClass(Pageable.class);
        verify(bookings).findReminderCandidates(eq(LOCAL_NOW), eq(LOCAL_NOW.plusHours(1)), pagination.capture());
        assertEquals(100, pagination.getValue().getPageSize());
        assertEquals(0, pagination.getValue().getPageNumber());
        ArgumentCaptor<String> subject = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> body = ArgumentCaptor.forClass(String.class);
        verify(emails).enqueueAppointmentReminder(eq(41L), eq("mai@example.test"), subject.capture(), body.capture(), eq(NOW.minusSeconds(1200)));
        assertFalse(subject.getValue().isBlank());
        for (String detail : List.of("41", "Ellora Nail", "Nguyễn Mai", "Sơn gel", "00:10 01/01/2027", "Việt Nam", "12 Đường Hoa", "02812345678")) {
            assertTrue(body.getValue().contains(detail), "Missing reminder detail: " + detail);
        }
        assertEquals("APPOINTMENT_REMINDER", BookingReminderService.KIND);
    }

    @Test void rechecksCandidateEligibilityBeforeEnqueueInsteadOfTrustingTheCandidateList() {
        BookingRepository bookings = mock(BookingRepository.class);
        BookingEmailRepository emails = mock(BookingEmailRepository.class);
        Booking valid = booking(LOCAL_NOW.plusMinutes(30));
        Booking cancelled = booking(LOCAL_NOW.plusMinutes(30)); cancelled.setStatus(BookingStatus.CANCELLED);
        Booking started = booking(LOCAL_NOW.plusMinutes(30)); started.setStatus(BookingStatus.IN_PROGRESS);
        Booking guest = booking(LOCAL_NOW.plusMinutes(30)); guest.setCustomer(null);
        Booking expired = booking(LOCAL_NOW);
        when(bookings.findReminderCandidates(any(), any(), any(Pageable.class)))
                .thenReturn(List.of(cancelled, started, guest, expired, valid));
        enabledService(bookings, emails).enqueueDueReminders();
        verify(emails, times(1)).enqueueAppointmentReminder(eq(41L), eq("mai@example.test"), anyString(), anyString(), eq(NOW.minusSeconds(1800)));
    }

    @Test void aConflictingAtomicInsertIsBenignWhenTheSameCandidateAppearsAgain() {
        BookingRepository bookings = mock(BookingRepository.class);
        BookingEmailRepository emails = mock(BookingEmailRepository.class);
        when(bookings.findReminderCandidates(any(), any(), any(Pageable.class)))
                .thenReturn(List.of(booking(LOCAL_NOW.plusMinutes(30))));
        when(emails.enqueueAppointmentReminder(anyLong(), anyString(), anyString(), anyString(), any())).thenReturn(1, 0);
        BookingReminderService service = enabledService(bookings, emails);
        assertDoesNotThrow(service::enqueueDueReminders);
        assertDoesNotThrow(service::enqueueDueReminders);
        verify(emails, times(2)).enqueueAppointmentReminder(eq(41L), eq("mai@example.test"), anyString(), anyString(), eq(NOW.minusSeconds(1800)));
    }

    @Test void missingOptionalSalonContactIsNotRenderedAsNull() {
        Booking candidate = booking(LOCAL_NOW.plusMinutes(30));
        candidate.getSalon().setAddress(null); candidate.getSalon().setPhone("  ");
        String body = BookingReminderService.body(candidate);
        assertTrue(body.contains("Ellora Nail")); assertTrue(body.contains("Sơn gel"));
        assertFalse(body.contains("null"));
    }
}
