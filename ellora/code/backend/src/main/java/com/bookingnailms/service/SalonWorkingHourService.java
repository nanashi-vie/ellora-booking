package com.bookingnailms.service;

import com.bookingnailms.dto.salon.SalonWorkingHourRequest;
import com.bookingnailms.entity.SalonWorkingHour;
import com.bookingnailms.entity.Salon;
import com.bookingnailms.entity.SalonClosure;
import com.bookingnailms.entity.Booking;
import com.bookingnailms.enums.BookingStatus;
import com.bookingnailms.dto.salon.SalonClosureRequest;
import com.bookingnailms.dto.salon.SalonClosureResponse;
import com.bookingnailms.exception.BadRequestException;
import com.bookingnailms.exception.ResourceNotFoundException;
import com.bookingnailms.repository.SalonRepository;
import com.bookingnailms.repository.SalonWorkingHourRepository;
import com.bookingnailms.repository.SalonClosureRepository;
import com.bookingnailms.repository.BookingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class SalonWorkingHourService {
    private final SalonWorkingHourRepository hours;
    private final SalonRepository salons;
    private final SalonClosureRepository closures;
    private final BookingRepository bookings;

    private LocalDate today() { return LocalDate.now(ZoneId.of("Asia/Ho_Chi_Minh")); }

    private Salon ownedSalon(UUID ownerId) {
        var owned = salons.findByOwnerId(ownerId)
                .orElseThrow(() -> new ResourceNotFoundException("Salon not found for current owner"));
        var salon = salons.findForUpdateById(owned.getId())
                .orElseThrow(() -> new ResourceNotFoundException("Salon not found"));
        if (!salon.getOwner().getId().equals(ownerId)) {
            throw new com.bookingnailms.exception.UnauthorizedException("Not your salon");
        }
        return salon;
    }

    @Transactional(readOnly = true)
    public List<SalonWorkingHourRequest> get(Long salonId) {
        requireSalon(salonId);
        var saved = hours.findBySalonIdOrderByDayOfWeek(salonId);
        return Arrays.stream(DayOfWeek.values()).map(day -> saved.stream()
                .filter(row -> row.getDayOfWeek() == day).findFirst()
                .map(row -> new SalonWorkingHourRequest(day, row.getOpenTime(), row.getCloseTime(), row.isClosed()))
                .orElseGet(() -> defaults(day))).toList();
    }

    @Transactional
    public List<SalonWorkingHourRequest> update(UUID ownerId, List<SalonWorkingHourRequest> requested) {
        var salon = ownedSalon(ownerId);
        if (requested == null || requested.size() != 7 || requested.stream().anyMatch(Objects::isNull)
                || requested.stream().map(SalonWorkingHourRequest::dayOfWeek).distinct().count() != 7
                || requested.stream().anyMatch(row -> row.dayOfWeek() == null)) {
            throw new BadRequestException("Cần cài đặt giờ cho đủ bảy ngày trong tuần.");
        }
        for (var row : requested) {
            if (!row.closed() && (row.openTime() == null || row.closeTime() == null
                    || !row.openTime().isBefore(row.closeTime())
                    || row.openTime().getMinute() % 30 != 0 || row.closeTime().getMinute() % 30 != 0
                    || row.openTime().getSecond() != 0 || row.closeTime().getSecond() != 0
                    || row.openTime().getNano() != 0 || row.closeTime().getNano() != 0)) {
                throw new BadRequestException("Giờ mở và đóng cửa phải hợp lệ, cách nhau theo mốc 30 phút.");
            }
        }
        var existing = hours.findBySalonIdOrderByDayOfWeek(salon.getId()).stream()
                .collect(java.util.stream.Collectors.toMap(SalonWorkingHour::getDayOfWeek, row -> row));
        var newlyClosed = requested.stream().filter(row -> {
            var saved = existing.get(row.dayOfWeek());
            boolean wasClosed = saved == null ? defaults(row.dayOfWeek()).closed() : saved.isClosed();
            return row.closed() && !wasClosed;
        })
                .map(SalonWorkingHourRequest::dayOfWeek).collect(java.util.stream.Collectors.toSet());
        LocalDate today = today();
        if (newlyClosed.contains(today.getDayOfWeek())) {
            throw new BadRequestException("Ngày nghỉ cần được cài đặt trước ít nhất một ngày. Không thể đóng cửa hôm nay.");
        }
        hours.saveAll(requested.stream().map(row -> {
            var saved = existing.getOrDefault(row.dayOfWeek(), SalonWorkingHour.builder()
                    .salon(salon).dayOfWeek(row.dayOfWeek()).build());
            saved.setClosed(row.closed());
            saved.setOpenTime(row.closed() ? null : row.openTime());
            saved.setCloseTime(row.closed() ? null : row.closeTime());
            return saved;
        }).toList());
        if (!newlyClosed.isEmpty()) {
            rejectBookings(bookings.findUpcomingForUpdate(salon.getId(), today.plusDays(1).atStartOfDay()).stream()
                    .filter(booking -> newlyClosed.contains(booking.getScheduledAt().getDayOfWeek())).toList(),
                    "Tiệm đóng cửa theo lịch hoạt động.");
        }
        return get(salon.getId());
    }

    @Transactional(readOnly = true)
    public SalonWorkingHourRequest get(Long salonId, DayOfWeek day) {
        requireSalon(salonId);
        return hours.findBySalonIdAndDayOfWeek(salonId, day)
                .map(row -> new SalonWorkingHourRequest(day, row.getOpenTime(), row.getCloseTime(), row.isClosed()))
                .orElseGet(() -> defaults(day));
    }

    @Transactional(readOnly = true)
    public SalonWorkingHourRequest get(Long salonId, LocalDate date) {
        if (closures.existsBySalonIdAndDate(salonId, date)) {
            return new SalonWorkingHourRequest(date.getDayOfWeek(), null, null, true);
        }
        return get(salonId, date.getDayOfWeek());
    }

    @Transactional(readOnly = true)
    public List<SalonClosureResponse> ownerClosures(UUID ownerId) {
        var salon = salons.findByOwnerId(ownerId)
                .orElseThrow(() -> new ResourceNotFoundException("Salon not found for current owner"));
        return closures.findBySalonIdAndDateGreaterThanEqualOrderByDate(salon.getId(), today()).stream()
                .map(row -> new SalonClosureResponse(row.getId(), row.getDate(), row.getReason())).toList();
    }

    @Transactional(readOnly = true)
    public List<LocalDate> closedDates(Long salonId, LocalDate from, LocalDate to) {
        requireSalon(salonId);
        if (from == null || to == null || to.isBefore(from) || to.isAfter(from.plusYears(1))) {
            throw new BadRequestException("Khoảng ngày nghỉ không hợp lệ (tối đa một năm).");
        }
        return closures.findBySalonIdAndDateBetweenOrderByDate(salonId, from, to).stream()
                .map(SalonClosure::getDate).toList();
    }

    @Transactional
    public SalonClosureResponse closeDate(UUID ownerId, SalonClosureRequest request) {
        var salon = ownedSalon(ownerId);
        if (request.date() == null || !request.date().isAfter(today())) {
            throw new BadRequestException("Ngày nghỉ cần được chọn trước ít nhất một ngày, từ ngày mai trở đi.");
        }
        var closure = closures.findBySalonIdAndDate(salon.getId(), request.date())
                .orElseGet(() -> SalonClosure.builder().salon(salon).date(request.date()).build());
        String reason = request.reason() == null || request.reason().isBlank() ? "Tiệm đóng cửa" : request.reason().strip();
        closure.setReason(reason);
        closure = closures.save(closure);
        rejectBookings(bookings.findUpcomingForUpdate(salon.getId(), request.date().atStartOfDay()).stream()
                .filter(booking -> booking.getScheduledAt().toLocalDate().equals(request.date())).toList(),
                "Tiệm đóng cửa: " + reason);
        return new SalonClosureResponse(closure.getId(), closure.getDate(), closure.getReason());
    }

    @Transactional
    public void reopenDate(UUID ownerId, Long closureId) {
        var salon = ownedSalon(ownerId);
        var closure = closures.findById(closureId)
                .filter(row -> row.getSalon().getId().equals(salon.getId()))
                .orElseThrow(() -> new ResourceNotFoundException("Ngày nghỉ không tồn tại trong tiệm của bạn."));
        closures.delete(closure);
    }

    private void rejectBookings(List<Booking> affected, String reason) {
        affected = affected.stream().filter(booking -> booking.getStatus() == BookingStatus.PENDING
                || booking.getStatus() == BookingStatus.CONFIRMED).toList();
        affected.forEach(booking -> {
            booking.setStatus(booking.getStatus() == BookingStatus.PENDING ? BookingStatus.REJECTED : BookingStatus.CANCELLED);
            booking.setCancellationReason(reason);
            booking.setSalonNote(reason);
        });
        bookings.saveAll(affected);
    }

    private void requireSalon(Long id) {
        if (!salons.existsById(id)) throw new ResourceNotFoundException("Salon", "id", id);
    }

    private SalonWorkingHourRequest defaults(DayOfWeek day) {
        boolean closed = day == DayOfWeek.SUNDAY;
        return new SalonWorkingHourRequest(day, closed ? null : LocalTime.of(9, 0), closed ? null : LocalTime.of(18, 0), closed);
    }
}
