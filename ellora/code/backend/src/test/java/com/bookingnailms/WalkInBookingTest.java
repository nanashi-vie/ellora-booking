package com.bookingnailms;

import com.bookingnailms.dto.booking.*;
import com.bookingnailms.dto.salon.SalonWorkingHourRequest;
import com.bookingnailms.entity.*;
import com.bookingnailms.enums.*;
import com.bookingnailms.exception.*;
import com.bookingnailms.repository.*;
import com.bookingnailms.service.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class WalkInBookingTest {
    private final BookingRepository bookings = mock(BookingRepository.class);
    private final SalonRepository salons = mock(SalonRepository.class);
    private final NailServiceRepository services = mock(NailServiceRepository.class);
    private final EmployeeRepository employees = mock(EmployeeRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final BookingEmailService emails = mock(BookingEmailService.class);
    private final SalonWorkingHourService hours = mock(SalonWorkingHourService.class);
    private final BookingService service = new BookingService(bookings, salons, services, employees, users, emails, hours);
    private final UUID owner = UUID.randomUUID();
    private final Salon salon = Salon.builder().id(1L).owner(User.builder().id(owner).build()).status(SalonStatus.ACTIVE).build();
    private final LocalDateTime at = LocalDateTime.of(2026, 10, 15, 10, 0);
    private final Employee employee = Employee.builder().id(3L).salon(salon).active(true).build();
    private Booking saved;
    private WalkInBookingRequest request() { return new WalkInBookingRequest(2L, null, at, "  Linh  ", " 0901234567 ", "Sơn gel"); }
    @BeforeEach void setup() {
        when(salons.findByOwnerId(owner)).thenReturn(Optional.of(salon)); when(salons.findForUpdateById(1L)).thenReturn(Optional.of(salon));
        when(services.findById(2L)).thenReturn(Optional.of(NailService.builder().id(2L).salon(salon).active(true).durationMinutes(60).price(new BigDecimal("150000")).build()));
        when(employees.findBySalonIdAndActiveTrue(1L)).thenReturn(List.of(employee));
        when(hours.get(1L, at.toLocalDate())).thenReturn(new SalonWorkingHourRequest(at.getDayOfWeek(), LocalTime.of(9, 0), LocalTime.of(19, 0), false));
        when(bookings.save(any())).thenAnswer(call -> { saved = call.getArgument(0); saved.setId(7L); return saved; });
    }
    @Test void createsRealGuestWithPriceSnapshotAndFreeEmployeeWithoutAccountOrEmail() {
        var response = service.createWalkIn(request(), owner);
        assertTrue(response.isWalkIn()); assertEquals("Linh", response.getCustomerName()); assertEquals("0901234567", response.getCustomerPhone());
        assertEquals(3L, response.getEmployeeId()); assertEquals(BookingStatus.PENDING, response.getStatus());
        assertEquals(new BigDecimal("150000"), response.getServicePrice()); assertNull(saved.getCustomer());
        assertEquals("0901234567", saved.getCustomerPhone());
        verifyNoInteractions(users, emails);
    }
    @Test void optionalGuestNameFallsBackAndCanBeConfirmedWithoutEmail() {
        var response = service.createWalkIn(new WalkInBookingRequest(2L, null, at, " ", null, null), owner);
        assertEquals("Khách vãng lai", response.getCustomerName());
        when(bookings.findForUpdateById(7L)).thenReturn(Optional.of(saved));
        var update = new BookingStatusUpdateRequest(); update.setStatus(BookingStatus.CONFIRMED);
        assertEquals(BookingStatus.CONFIRMED, service.updateBookingStatus(7L, update, owner).getStatus());
        verifyNoInteractions(emails);
    }
    @Test void rejectsClosedDatesAndWholeServiceOutsideHours() {
        when(hours.get(1L, at.toLocalDate())).thenReturn(new SalonWorkingHourRequest(at.getDayOfWeek(), null, null, true));
        assertThrows(BadRequestException.class, () -> service.createWalkIn(request(), owner));
        when(hours.get(1L, at.toLocalDate())).thenReturn(new SalonWorkingHourRequest(at.getDayOfWeek(), LocalTime.of(9, 0), LocalTime.of(10, 30), false));
        assertThrows(BadRequestException.class, () -> service.createWalkIn(request(), owner)); verify(bookings, never()).save(any());
    }
    @Test void rejectsConflictingStaffAndServicesFromOtherSalons() {
        when(bookings.findOverlapping(1L, at, at.plusMinutes(60))).thenReturn(List.of(Booking.builder().employee(employee).build()));
        assertThrows(BadRequestException.class, () -> service.createWalkIn(request(), owner));
        when(services.findById(2L)).thenReturn(Optional.of(NailService.builder().id(2L).salon(Salon.builder().id(99L).build()).active(true).build()));
        assertThrows(BadRequestException.class, () -> service.createWalkIn(request(), owner)); verify(bookings, never()).save(any());
    }
    @Test void unknownOwnerCannotChooseAnotherSalon() {
        assertThrows(ResourceNotFoundException.class, () -> service.createWalkIn(request(), UUID.randomUUID()));
        verify(bookings, never()).save(any());
    }
    @Test void customerCannotCancelGuestBooking() {
        service.createWalkIn(request(), owner); when(bookings.findForUpdateById(7L)).thenReturn(Optional.of(saved));
        assertThrows(UnauthorizedException.class, () -> service.cancelBooking(7L, UUID.randomUUID()));
    }
}
