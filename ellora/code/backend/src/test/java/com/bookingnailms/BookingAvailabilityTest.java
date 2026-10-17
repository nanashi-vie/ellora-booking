package com.bookingnailms;

import com.bookingnailms.dto.booking.BookingRequest;
import com.bookingnailms.entity.*;
import com.bookingnailms.enums.*;
import com.bookingnailms.exception.BadRequestException;
import com.bookingnailms.repository.*;
import com.bookingnailms.service.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.time.LocalDateTime;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BookingAvailabilityTest {
    private final BookingRepository bookings = mock(BookingRepository.class);
    private final SalonRepository salons = mock(SalonRepository.class);
    private final NailServiceRepository services = mock(NailServiceRepository.class);
    private final EmployeeRepository employees = mock(EmployeeRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final BookingEmailService emails = mock(BookingEmailService.class);
    private final BookingService service = new BookingService(bookings, salons, services, employees, users, emails, null,
            Clock.fixed(Instant.parse("2026-10-01T00:00:00Z"), ZoneOffset.UTC));
    private final UUID customerId = UUID.randomUUID();
    private final LocalDateTime start = LocalDateTime.of(2026, 10, 1, 9, 30);
    private final Salon salon = Salon.builder().id(1L).status(SalonStatus.ACTIVE).build();
    private final Employee first = Employee.builder().id(10L).salon(salon).build();
    private final Employee second = Employee.builder().id(11L).salon(salon).build();

    @BeforeEach void setup() {
        when(users.findById(customerId)).thenReturn(Optional.of(User.builder().id(customerId).build()));
        when(salons.findForUpdateById(1L)).thenReturn(Optional.of(salon));
        when(services.findById(2L)).thenReturn(Optional.of(NailService.builder().id(2L)
                .salon(salon).active(true).durationMinutes(90).build()));
        when(employees.findById(10L)).thenReturn(Optional.of(first));
        when(employees.findBySalonIdAndActiveTrue(1L)).thenReturn(List.of(first, second));
        when(bookings.save(any())).thenAnswer(call -> call.getArgument(0));
    }

    private BookingRequest request(Long employee) { return new BookingRequest(1L, 2L, employee, start, null); }
    private void busy(Employee... staff) {
        when(bookings.findOverlapping(1L, start, start.plusMinutes(90))).thenReturn(
                Arrays.stream(staff).map(e -> Booking.builder().employee(e).build()).toList());
    }

    @Test void rejectsSelectedBusyEmployeeWithoutSavingOrEmail() {
        busy(first);
        assertThrows(BadRequestException.class, () -> service.createBooking(request(10L), customerId));
        verify(bookings, never()).save(any());
        verifyNoInteractions(emails);
    }

    @Test void automaticallyAssignsFreeEmployeeAndChecksFullDurationAfterLock() {
        busy(first);
        assertEquals(11L, service.createBooking(request(null), customerId).getEmployeeId());
        var order = inOrder(salons, bookings);
        order.verify(salons).findForUpdateById(1L);
        order.verify(bookings).findOverlapping(1L, start, start.plusMinutes(90));
        order.verify(bookings).save(any());
        verify(emails).enqueue(any(), eq(false));
    }

    @Test void allowsDifferentEmployeeDuringAnotherEmployeesBooking() {
        busy(second);
        assertEquals(10L, service.createBooking(request(10L), customerId).getEmployeeId());
    }

    @Test void rejectsWhenAllEmployeesAreBusy() {
        busy(first, second);
        assertThrows(BadRequestException.class, () -> service.createBooking(request(null), customerId));
        verify(bookings, never()).save(any());
    }

    @Test void rejectsSalonWithoutActiveEmployees() {
        when(employees.findBySalonIdAndActiveTrue(1L)).thenReturn(List.of());
        assertThrows(BadRequestException.class, () -> service.createBooking(request(null), customerId));
        verify(bookings, never()).save(any());
    }

    @Test void doesNotIgnoreUnassignedLegacyBookings() {
        busy((Employee) null);
        assertThrows(BadRequestException.class, () -> service.createBooking(request(10L), customerId));
        verify(bookings, never()).save(any());
    }

    @Test void rejectsEmployeeFromAnotherSalon() {
        first.setSalon(Salon.builder().id(99L).build());
        assertThrows(BadRequestException.class, () -> service.createBooking(request(10L), customerId));
        verify(bookings, never()).save(any());
    }
}
