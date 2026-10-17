package com.bookingnailms;

import com.bookingnailms.dto.booking.BookingRequest;
import com.bookingnailms.entity.*;
import com.bookingnailms.enums.SalonStatus;
import com.bookingnailms.repository.*;
import com.bookingnailms.service.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.time.*;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BookingContactTest {
    private final BookingRepository bookings = mock(BookingRepository.class);
    private final SalonRepository salons = mock(SalonRepository.class);
    private final NailServiceRepository services = mock(NailServiceRepository.class);
    private final EmployeeRepository employees = mock(EmployeeRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final BookingEmailService emails = mock(BookingEmailService.class);
    private final BookingService service = new BookingService(bookings, salons, services, employees, users, emails, null,
            Clock.fixed(Instant.parse("2026-10-17T03:00:00Z"), ZoneOffset.UTC));
    private final User customer = User.builder().id(UUID.randomUUID()).fullName("Linh").phone("0900000000").build();
    private final Salon salon = Salon.builder().id(1L).status(SalonStatus.ACTIVE).build();
    private final NailService nailService = NailService.builder().id(2L).salon(salon).active(true).durationMinutes(60).build();
    private final Employee employee = Employee.builder().id(3L).salon(salon).active(true).build();
    private Booking saved;

    @BeforeEach void setup() {
        when(users.findById(customer.getId())).thenReturn(Optional.of(customer));
        when(salons.findForUpdateById(1L)).thenReturn(Optional.of(salon));
        when(services.findById(2L)).thenReturn(Optional.of(nailService));
        when(employees.findById(3L)).thenReturn(Optional.of(employee));
        when(bookings.save(any())).thenAnswer(call -> { saved = call.getArgument(0); saved.setId(7L); return saved; });
    }

    private BookingRequest request(String phone) {
        var request = new BookingRequest(1L, 2L, 3L, LocalDateTime.of(2026, 10, 17, 11, 7), null);
        request.setCustomerPhone(phone);
        return request;
    }

    @Test void snapshotsProvidedPhoneWithoutChangingProfileAndRetainsItInOwnerHistory() {
        var response = service.createBooking(request(" 0901234567 "), customer.getId());
        assertEquals("0901234567", saved.getCustomerPhone());
        assertEquals("0901234567", response.getCustomerPhone());
        assertEquals("0900000000", customer.getPhone());
        assertEquals("Linh", customer.getFullName());
        assertFalse(response.isWalkIn());
        verify(users, never()).save(any());

        customer.setPhone("0988888888");
        var page = PageRequest.of(0, 20);
        when(bookings.findBySalonIdOrderByScheduledAtDesc(1L, page)).thenReturn(new PageImpl<>(List.of(saved)));
        assertEquals("0901234567", service.getSalonBookings(1L, null, page).getContent().get(0).getCustomerPhone());
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = { "", "   " })
    void snapshotsProfilePhoneWhenRequestHasNoNumber(String phone) {
        assertEquals("0900000000", service.createBooking(request(phone), customer.getId()).getCustomerPhone());
        assertEquals("0900000000", saved.getCustomerPhone());
        assertEquals("0900000000", customer.getPhone());
        verify(users, never()).save(any());
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = { "", "   " })
    void olderCustomerBookingsFallBackToProfilePhone(String storedPhone) {
        var oldBooking = Booking.builder().id(7L).customer(customer).customerPhone(storedPhone)
                .salon(salon).service(nailService).employee(employee).build();
        var page = PageRequest.of(0, 20);
        when(bookings.findBySalonIdOrderByScheduledAtDesc(1L, page)).thenReturn(new PageImpl<>(List.of(oldBooking)));
        when(bookings.findByCustomerIdOrderByCreatedAtDesc(customer.getId(), page)).thenReturn(new PageImpl<>(List.of(oldBooking)));
        assertEquals("0900000000", service.getSalonBookings(1L, null, page).getContent().get(0).getCustomerPhone());
        assertEquals("0900000000", service.getMyBookings(customer.getId(), page).getContent().get(0).getCustomerPhone());
        assertEquals(storedPhone, oldBooking.getCustomerPhone());
        verify(bookings, never()).save(any());
        verify(users, never()).save(any());
    }

    @Test void missingBookingAndProfileNumbersRemainMissing() {
        customer.setPhone(null);
        assertNull(service.createBooking(request(null), customer.getId()).getCustomerPhone());
        assertNull(saved.getCustomerPhone());
        verify(users, never()).save(any());
    }
}
