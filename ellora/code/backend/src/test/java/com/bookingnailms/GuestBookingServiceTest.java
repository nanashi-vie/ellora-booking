package com.bookingnailms;

import com.bookingnailms.dto.booking.BookingStatusUpdateRequest;
import com.bookingnailms.dto.booking.GuestBookingRequest;
import com.bookingnailms.dto.salon.SalonWorkingHourRequest;
import com.bookingnailms.entity.*;
import com.bookingnailms.enums.BookingStatus;
import com.bookingnailms.enums.SalonStatus;
import com.bookingnailms.exception.BadRequestException;
import com.bookingnailms.repository.*;
import com.bookingnailms.service.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class GuestBookingServiceTest {
    private final BookingRepository bookings = mock(BookingRepository.class);
    private final SalonRepository salons = mock(SalonRepository.class);
    private final NailServiceRepository services = mock(NailServiceRepository.class);
    private final EmployeeRepository employees = mock(EmployeeRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final BookingEmailService emails = mock(BookingEmailService.class);
    private final SalonWorkingHourService hours = mock(SalonWorkingHourService.class);
    private final UUID ownerId = UUID.randomUUID();
    private final Salon salon = Salon.builder().id(1L).name("Ellora Nail").status(SalonStatus.ACTIVE)
            .owner(User.builder().id(ownerId).build()).build();
    private final NailService nailService = NailService.builder().id(2L).name("Sơn gel").salon(salon)
            .active(true).durationMinutes(60).price(new BigDecimal("150000")).build();
    private final Employee employee = Employee.builder().id(3L).salon(salon).active(true).build();
    private final LocalDateTime at = LocalDateTime.of(2026, 10, 18, 9, 7);
    private final Clock clock = Clock.fixed(Instant.parse("2026-10-18T01:07:00Z"), ZoneOffset.UTC);
    private Booking saved;

    @BeforeEach void setup() {
        when(salons.findForUpdateById(1L)).thenReturn(Optional.of(salon));
        when(services.findById(2L)).thenReturn(Optional.of(nailService));
        when(employees.findById(3L)).thenReturn(Optional.of(employee));
        when(employees.findBySalonIdAndActiveTrue(1L)).thenReturn(List.of(employee));
        when(hours.get(eq(1L), any(LocalDate.class))).thenAnswer(call -> {
            LocalDate date = call.getArgument(1);
            return new SalonWorkingHourRequest(date.getDayOfWeek(), LocalTime.of(9, 0), LocalTime.of(19, 0), false);
        });
        when(bookings.save(any())).thenAnswer(call -> {
            saved = call.getArgument(0);
            saved.setId(7L);
            return saved;
        });
    }

    private BookingService service(Clock bookingClock) {
        return new BookingService(bookings, salons, services, employees, users, emails, hours, bookingClock);
    }

    private GuestBookingRequest request(LocalDateTime scheduledAt, Long employeeId) {
        return new GuestBookingRequest(1L, 2L, employeeId, scheduledAt,
                "  Nguyễn Mai  ", " 0901234567 ", " mai@example.test ", "Sơn màu hồng");
    }

    @Test void savesRequiredGuestContactAndPriceWithoutCreatingOrLinkingAnAccount() {
        var receipt = service(clock).createGuestBooking(request(at, 3L));

        assertEquals(7L, receipt.id());
        assertEquals(BookingStatus.PENDING, receipt.status());
        assertEquals(at, receipt.scheduledAt());
        assertEquals("Ellora Nail", receipt.salonName());
        assertEquals("Sơn gel", receipt.serviceName());
        assertNull(saved.getCustomer());
        assertEquals("Nguyễn Mai", saved.getWalkInName());
        assertEquals("0901234567", saved.getCustomerPhone());
        assertEquals("mai@example.test", saved.getGuestEmail());
        assertEquals("Sơn màu hồng", saved.getCustomerNote());
        assertEquals(new BigDecimal("150000"), saved.getServicePriceSnapshot());
        verifyNoInteractions(users);
        verify(emails).enqueue(saved, false);
        verify(emails).enqueueGuestReceipt(saved);
        verify(bookings).findOverlapping(1L, at, at.plusHours(1));
    }

    @Test void automaticallyAssignsAFreeEmployeeAtTheRequestedMinute() {
        service(clock).createGuestBooking(request(at, null));
        assertEquals(3L, saved.getEmployee().getId());
        assertEquals(at, saved.getScheduledAt());
        verifyNoInteractions(users);
    }

    @ParameterizedTest
    @ValueSource(strings = {"2026-10-17T09:07:00", "2026-10-18T08:07:00", "2026-10-18T09:06:00",
            "2026-10-18T09:07:01", "2026-10-18T09:07:00.000000001"})
    void rejectsPastInsufficientNoticeAndSubMinuteRequestsBeforeSaving(String scheduledAt) {
        assertThrows(BadRequestException.class,
                () -> service(clock).createGuestBooking(request(LocalDateTime.parse(scheduledAt), 3L)));
        verify(bookings, never()).save(any());
        verifyNoInteractions(users, emails);
    }

    @Test void noticeUsesFreshTimeAfterWaitingForTheSalonLock() {
        Clock changingClock = mock(Clock.class);
        when(changingClock.instant()).thenReturn(Instant.parse("2026-10-18T01:00:00Z"));
        when(salons.findForUpdateById(1L)).thenAnswer(call -> {
            when(changingClock.instant()).thenReturn(Instant.parse("2026-10-18T02:00:00Z"));
            return Optional.of(salon);
        });
        assertThrows(BadRequestException.class,
                () -> service(changingClock).createGuestBooking(request(at, 3L)));
        var order = inOrder(salons, changingClock);
        order.verify(salons).findForUpdateById(1L);
        order.verify(changingClock).instant();
        verify(bookings, never()).save(any());
        verifyNoInteractions(emails);
    }

    @Test void rejectsClosureAndAppointmentsWhoseFullServiceExceedsOpeningHours() {
        when(hours.get(1L, at.toLocalDate())).thenReturn(
                new SalonWorkingHourRequest(at.getDayOfWeek(), null, null, true));
        assertThrows(BadRequestException.class, () -> service(clock).createGuestBooking(request(at, 3L)));
        when(hours.get(1L, at.toLocalDate())).thenReturn(
                new SalonWorkingHourRequest(at.getDayOfWeek(), LocalTime.of(9, 0), LocalTime.of(19, 0), false));
        assertThrows(BadRequestException.class,
                () -> service(clock).createGuestBooking(request(at.withHour(18), 3L)));
        verify(bookings, never()).save(any());
        verifyNoInteractions(emails);
    }

    @Test void rejectsAnOccupiedEmployeeAndUnassignedLegacyReservations() {
        when(bookings.findOverlapping(1L, at, at.plusHours(1)))
                .thenReturn(List.of(Booking.builder().employee(employee).build()));
        assertThrows(BadRequestException.class, () -> service(clock).createGuestBooking(request(at, 3L)));
        when(bookings.findOverlapping(1L, at, at.plusHours(1)))
                .thenReturn(List.of(Booking.builder().build()));
        assertThrows(BadRequestException.class, () -> service(clock).createGuestBooking(request(at, null)));
        verify(bookings, never()).save(any());
        verifyNoInteractions(emails);
    }

    @Test void inactiveSalonsAndServicesOrEmployeesFromOtherSalonsCannotBeBooked() {
        salon.setStatus(SalonStatus.PENDING_APPROVAL);
        assertThrows(BadRequestException.class, () -> service(clock).createGuestBooking(request(at, 3L)));
        salon.setStatus(SalonStatus.ACTIVE);
        nailService.setActive(false);
        assertThrows(BadRequestException.class, () -> service(clock).createGuestBooking(request(at, 3L)));
        nailService.setActive(true);
        nailService.setSalon(Salon.builder().id(99L).build());
        assertThrows(BadRequestException.class, () -> service(clock).createGuestBooking(request(at, 3L)));
        nailService.setSalon(salon);
        employee.setSalon(Salon.builder().id(99L).build());
        assertThrows(BadRequestException.class, () -> service(clock).createGuestBooking(request(at, 3L)));
        verify(bookings, never()).save(any());
        verifyNoInteractions(emails);
    }

    @Test void salonConfirmationEnqueuesGuestMailOnceAndKeepsItsContactInOwnerDetails() {
        var service = service(clock);
        service.createGuestBooking(request(at, 3L));
        when(bookings.findForUpdateById(7L)).thenReturn(Optional.of(saved));
        var status = new BookingStatusUpdateRequest();
        status.setStatus(BookingStatus.CONFIRMED);

        var response = service.updateBookingStatus(7L, status, ownerId);
        assertEquals("Nguyễn Mai", response.getCustomerName());
        assertEquals("0901234567", response.getCustomerPhone());
        service.updateBookingStatus(7L, status, ownerId);
        verify(emails, times(1)).enqueue(saved, true);
        verifyNoInteractions(users);
    }
}
