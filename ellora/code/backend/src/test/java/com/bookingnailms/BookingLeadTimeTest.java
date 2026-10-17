package com.bookingnailms;

import com.bookingnailms.dto.booking.BookingRequest;
import com.bookingnailms.dto.booking.WalkInBookingRequest;
import com.bookingnailms.dto.salon.SalonWorkingHourRequest;
import com.bookingnailms.entity.*;
import com.bookingnailms.enums.*;
import com.bookingnailms.exception.BadRequestException;
import com.bookingnailms.repository.*;
import com.bookingnailms.service.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.time.*;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BookingLeadTimeTest {
    private final BookingRepository bookings = mock(BookingRepository.class);
    private final SalonRepository salons = mock(SalonRepository.class);
    private final NailServiceRepository services = mock(NailServiceRepository.class);
    private final EmployeeRepository employees = mock(EmployeeRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final BookingEmailService emails = mock(BookingEmailService.class);
    private final SalonWorkingHourService hours = mock(SalonWorkingHourService.class);
    private final UUID customerId = UUID.randomUUID();
    private final UUID ownerId = UUID.randomUUID();
    private final Salon salon = Salon.builder().id(1L).owner(User.builder().id(ownerId).build()).status(SalonStatus.ACTIVE).build();
    private final Employee employee = Employee.builder().id(3L).salon(salon).active(true).build();
    private final NailService nailService = NailService.builder().id(2L).salon(salon).active(true).durationMinutes(90).build();

    @BeforeEach void setup() {
        when(users.findById(customerId)).thenReturn(Optional.of(User.builder().id(customerId).build()));
        when(salons.findForUpdateById(1L)).thenReturn(Optional.of(salon));
        when(salons.findByOwnerId(ownerId)).thenReturn(Optional.of(salon));
        when(services.findById(2L)).thenReturn(Optional.of(nailService));
        when(employees.findById(3L)).thenReturn(Optional.of(employee));
        when(hours.get(eq(1L), any(LocalDate.class))).thenAnswer(call -> {
            LocalDate date = call.getArgument(1);
            return new SalonWorkingHourRequest(date.getDayOfWeek(), LocalTime.of(9, 0), LocalTime.of(19, 0), false);
        });
        when(bookings.save(any())).thenAnswer(call -> call.getArgument(0));
    }

    private BookingService service(Clock clock) {
        return new BookingService(bookings, salons, services, employees, users, emails, hours, clock);
    }

    private BookingService serviceAt(String now) {
        return service(Clock.fixed(Instant.parse(now), ZoneId.of("America/New_York")));
    }

    private BookingRequest request(String scheduledAt) {
        return new BookingRequest(1L, 2L, 3L, LocalDateTime.parse(scheduledAt), null);
    }

    @ParameterizedTest
    @ValueSource(strings = { "2026-10-16T11:07:00", "2026-10-17T09:00:00", "2026-10-17T10:07:00", "2026-10-17T11:06:00" })
    void rejectsPastAndLessThanOneHourNoticeWithoutSavingOrEmail(String scheduledAt) {
        var error = assertThrows(BadRequestException.class,
                () -> serviceAt("2026-10-17T03:07:00Z").createBooking(request(scheduledAt), customerId));
        assertTrue(error.getMessage().contains("ít nhất 1 giờ"));
        verify(bookings, never()).save(any());
        verifyNoInteractions(emails);
    }

    @Test void acceptsExactBoundaryAtAnyMinuteAndChecksWholeDuration() {
        var response = serviceAt("2026-10-17T03:07:00Z").createBooking(request("2026-10-17T11:07:00"), customerId);
        assertEquals(LocalDateTime.of(2026, 10, 17, 11, 7), response.getScheduledAt());
        verify(bookings).findOverlapping(1L, LocalDateTime.of(2026, 10, 17, 11, 7), LocalDateTime.of(2026, 10, 17, 12, 37));
        verify(emails).enqueue(any(), eq(false));
    }

    @Test void roundsEarliestSelectableMinuteUpWhenCurrentInstantHasSeconds() {
        var service = serviceAt("2026-10-17T03:07:30Z");
        assertThrows(BadRequestException.class, () -> service.createBooking(request("2026-10-17T11:07:00"), customerId));
        assertEquals(LocalDateTime.of(2026, 10, 17, 11, 8),
                service.createBooking(request("2026-10-17T11:08:00"), customerId).getScheduledAt());
        verify(bookings, times(1)).save(any());
    }

    @ParameterizedTest
    @ValueSource(strings = { "2026-10-17T11:07:01", "2026-10-17T11:07:00.000000001" })
    void rejectsSubMinutePrecision(String scheduledAt) {
        assertThrows(BadRequestException.class,
                () -> serviceAt("2026-10-17T03:07:00Z").createBooking(request(scheduledAt), customerId));
        verify(bookings, never()).save(any());
    }

    @Test void appliesNoticeAcrossVietnamMidnightAndYearBoundary() {
        var date = LocalDate.of(2027, 1, 1);
        when(hours.get(1L, date)).thenReturn(new SalonWorkingHourRequest(date.getDayOfWeek(), LocalTime.MIDNIGHT, LocalTime.of(3, 0), false));
        var service = serviceAt("2026-12-31T16:35:30Z");
        assertThrows(BadRequestException.class, () -> service.createBooking(request("2027-01-01T00:35:00"), customerId));
        assertEquals(date.atTime(0, 36), service.createBooking(request("2027-01-01T00:36:00"), customerId).getScheduledAt());
    }

    @Test void measuresNoticeAfterWaitingForSalonLock() {
        Clock clock = mock(Clock.class);
        when(clock.instant()).thenReturn(Instant.parse("2026-10-17T03:00:00Z"));
        when(salons.findForUpdateById(1L)).thenAnswer(call -> {
            when(clock.instant()).thenReturn(Instant.parse("2026-10-17T04:00:00Z"));
            return Optional.of(salon);
        });
        assertThrows(BadRequestException.class, () -> service(clock).createBooking(request("2026-10-17T11:30:00"), customerId));
        var order = inOrder(salons, clock);
        order.verify(salons).findForUpdateById(1L);
        order.verify(clock).instant();
        verify(bookings, never()).save(any());
    }

    @Test void arbitraryMinutesStillRespectClosuresAndEntireServiceHours() {
        var service = serviceAt("2026-10-17T03:07:00Z");
        assertThrows(BadRequestException.class, () -> service.createBooking(request("2026-10-17T18:07:00"), customerId));
        var date = LocalDate.of(2026, 10, 17);
        when(hours.get(1L, date)).thenReturn(new SalonWorkingHourRequest(date.getDayOfWeek(), null, null, true));
        assertThrows(BadRequestException.class, () -> service.createBooking(request("2026-10-17T11:07:00"), customerId));
        verify(bookings, never()).save(any());
    }

    @Test void arbitraryMinutesStillRespectEmployeeConflicts() {
        var start = LocalDateTime.of(2026, 10, 17, 11, 7);
        when(bookings.findOverlapping(1L, start, start.plusMinutes(90))).thenReturn(List.of(Booking.builder().employee(employee).build()));
        assertThrows(BadRequestException.class,
                () -> serviceAt("2026-10-17T03:07:00Z").createBooking(request(start.toString()), customerId));
        verify(bookings, never()).save(any());
        verifyNoInteractions(emails);
    }

    @Test void ownerWalkInCanStartImmediatelyAndKeepsHalfHourValidation() {
        var service = serviceAt("2026-10-17T03:00:00Z");
        assertThrows(BadRequestException.class, () -> service.createWalkIn(new WalkInBookingRequest(2L, 3L,
                LocalDateTime.of(2026, 10, 17, 10, 7), "Khách", null, null), ownerId));
        var now = LocalDateTime.of(2026, 10, 17, 10, 0);
        assertEquals(now, service.createWalkIn(new WalkInBookingRequest(2L, 3L, now, "Khách", null, null), ownerId).getScheduledAt());
        verifyNoInteractions(users, emails);
    }
}
