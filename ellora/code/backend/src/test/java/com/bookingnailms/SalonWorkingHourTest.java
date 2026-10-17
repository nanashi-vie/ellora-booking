package com.bookingnailms;

import com.bookingnailms.dto.salon.*;
import com.bookingnailms.entity.*;
import com.bookingnailms.enums.BookingStatus;
import com.bookingnailms.exception.*;
import com.bookingnailms.repository.*;
import com.bookingnailms.service.SalonWorkingHourService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SalonWorkingHourTest {
    private final SalonWorkingHourRepository hours = mock(SalonWorkingHourRepository.class);
    private final SalonRepository salons = mock(SalonRepository.class);
    private final SalonClosureRepository closures = mock(SalonClosureRepository.class);
    private final BookingRepository bookings = mock(BookingRepository.class);
    private final SalonWorkingHourService service = new SalonWorkingHourService(hours, salons, closures, bookings);
    private final UUID owner = UUID.randomUUID();
    private final Salon salon = Salon.builder().id(1L).owner(User.builder().id(owner).build()).build();
    private LocalDate today() { return LocalDate.now(ZoneId.of("Asia/Ho_Chi_Minh")); }
    private List<SalonWorkingHourRequest> week() {
        return Arrays.stream(DayOfWeek.values()).map(day -> new SalonWorkingHourRequest(day, LocalTime.of(9, 0), LocalTime.of(19, 0), false)).toList();
    }
    private List<SalonWorkingHourRequest> closed(DayOfWeek day) {
        return week().stream().map(row -> row.dayOfWeek() == day ? new SalonWorkingHourRequest(day, null, null, true) : row).toList();
    }
    private Booking booking(LocalDate date, BookingStatus status) {
        return Booking.builder().salon(salon).scheduledAt(date.atTime(10, 0)).status(status).build();
    }
    @BeforeEach void setup() {
        when(salons.findByOwnerId(owner)).thenReturn(Optional.of(salon));
        when(salons.findForUpdateById(1L)).thenReturn(Optional.of(salon));
        when(salons.existsById(1L)).thenReturn(true);
        when(hours.findBySalonIdOrderByDayOfWeek(1L)).thenReturn(week().stream().map(row ->
                SalonWorkingHour.builder().salon(salon).dayOfWeek(row.dayOfWeek()).openTime(row.openTime()).closeTime(row.closeTime()).closed(false).build()).toList());
        when(closures.save(any())).thenAnswer(call -> { SalonClosure row = call.getArgument(0); row.setId(9L); return row; });
    }
    @Test void rejectsSameDayOrPastClosuresWithoutChanges() {
        for (LocalDate date : List.of(today(), today().minusDays(1))) {
            assertThrows(BadRequestException.class, () -> service.closeDate(owner, new SalonClosureRequest(date, "Bận")));
        }
        verify(closures, never()).save(any()); verify(bookings, never()).saveAll(any());
    }
    @Test void closingTomorrowOnlyRejectsPendingAndCancelsConfirmedOnThatDate() {
        LocalDate date = today().plusDays(1);
        var pending = booking(date, BookingStatus.PENDING); var confirmed = booking(date, BookingStatus.CONFIRMED);
        var completed = booking(date, BookingStatus.COMPLETED); var inProgress = booking(date, BookingStatus.IN_PROGRESS);
        var otherDay = booking(date.plusDays(1), BookingStatus.CONFIRMED);
        when(bookings.findUpcomingForUpdate(1L, date.atStartOfDay())).thenReturn(List.of(pending, confirmed, completed, inProgress, otherDay));
        var result = service.closeDate(owner, new SalonClosureRequest(date, "  Bận công việc  "));
        assertEquals(date, result.date()); assertEquals("Bận công việc", result.reason());
        assertEquals(BookingStatus.REJECTED, pending.getStatus()); assertEquals(BookingStatus.CANCELLED, confirmed.getStatus());
        assertEquals(BookingStatus.COMPLETED, completed.getStatus()); assertEquals(BookingStatus.IN_PROGRESS, inProgress.getStatus());
        assertEquals(BookingStatus.CONFIRMED, otherDay.getStatus()); assertTrue(pending.getCancellationReason().contains("Bận công việc"));
        var order = inOrder(salons, closures, bookings);
        order.verify(salons).findByOwnerId(owner); order.verify(salons).findForUpdateById(1L);
        order.verify(closures).findBySalonIdAndDate(1L, date); order.verify(closures).save(any());
        order.verify(bookings).findUpcomingForUpdate(1L, date.atStartOfDay());
    }
    @Test void datedClosureOverridesWeeklyOpenHours() {
        LocalDate date = today().plusDays(1); when(closures.existsBySalonIdAndDate(1L, date)).thenReturn(true);
        assertTrue(service.get(1L, date).closed()); verifyNoInteractions(hours);
    }
    @Test void newlyClosingTodaysWeekdayIsRejected() {
        assertThrows(BadRequestException.class, () -> service.update(owner, closed(today().getDayOfWeek())));
        verify(hours, never()).saveAll(any());
    }
    @Test void weeklyClosureCancelsOnlyFutureAppointmentsOnThatWeekday() {
        LocalDate tomorrow = today().plusDays(1);
        var affected = booking(tomorrow.plusWeeks(1), BookingStatus.CONFIRMED);
        var otherDay = booking(tomorrow.plusDays(1), BookingStatus.PENDING);
        when(bookings.findUpcomingForUpdate(1L, tomorrow.atStartOfDay())).thenReturn(List.of(affected, otherDay));
        service.update(owner, closed(tomorrow.getDayOfWeek()));
        assertEquals(BookingStatus.CANCELLED, affected.getStatus()); assertEquals(BookingStatus.PENDING, otherDay.getStatus());
        verify(hours).saveAll(any());
    }
    @Test void openingDaysDoesNotRestoreRejectedBookings() {
        service.update(owner, week()); verify(bookings, never()).findUpcomingForUpdate(any(), any());
    }
    @Test void validatesAllSevenDaysAndHalfHourIntervals() {
        assertThrows(BadRequestException.class, () -> service.update(owner, week().subList(0, 6)));
        var invalid = new ArrayList<>(week()); invalid.set(0, new SalonWorkingHourRequest(DayOfWeek.MONDAY, LocalTime.of(9, 15), LocalTime.of(19, 0), false));
        assertThrows(BadRequestException.class, () -> service.update(owner, invalid));
        verify(hours, never()).saveAll(any());
    }
    @Test void reopeningChecksOwnershipAndDoesNotRestoreBookings() {
        var closure = SalonClosure.builder().id(9L).salon(salon).date(today().plusDays(1)).build();
        when(closures.findById(9L)).thenReturn(Optional.of(closure)); service.reopenDate(owner, 9L);
        verify(closures).delete(closure); verifyNoInteractions(bookings);
        closure.setSalon(Salon.builder().id(42L).build());
        assertThrows(ResourceNotFoundException.class, () -> service.reopenDate(owner, 9L));
    }
    @Test void unknownOwnerCannotChangeClosures() {
        assertThrows(ResourceNotFoundException.class, () -> service.closeDate(UUID.randomUUID(), new SalonClosureRequest(today().plusDays(1), null)));
        verifyNoInteractions(closures, bookings);
    }
}
