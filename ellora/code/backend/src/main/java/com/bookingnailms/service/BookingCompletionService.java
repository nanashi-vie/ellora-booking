package com.bookingnailms.service;

import com.bookingnailms.dto.booking.*;
import com.bookingnailms.dto.common.PageResponse;
import com.bookingnailms.entity.*;
import com.bookingnailms.enums.*;
import com.bookingnailms.exception.*;
import com.bookingnailms.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.Objects;
import java.util.UUID;

@Service
public class BookingCompletionService {
    private static final ZoneId ZONE = ZoneId.of("Asia/Ho_Chi_Minh");
    private final BookingRepository bookings;
    private final SalonRepository salons;
    private final BookingCompletionDisputeRepository disputes;
    private final BookingService bookingService;
    private final Clock clock;

    @Autowired
    public BookingCompletionService(BookingRepository bookings, SalonRepository salons,
            BookingCompletionDisputeRepository disputes, BookingService bookingService) {
        this(bookings, salons, disputes, bookingService, Clock.systemUTC());
    }

    public BookingCompletionService(BookingRepository bookings, SalonRepository salons,
            BookingCompletionDisputeRepository disputes, BookingService bookingService, Clock clock) {
        this.bookings = bookings; this.salons = salons; this.disputes = disputes;
        this.bookingService = bookingService; this.clock = clock;
    }

    private LocalDateTime now() { return LocalDateTime.ofInstant(clock.instant(), ZONE); }
    private void requireId(Long id) {
        if (id == null || id <= 0) throw new BadRequestException("Mã lịch hẹn hoặc báo cáo không hợp lệ.");
    }

    @Transactional
    @PreAuthorize("hasRole('CUSTOMER')")
    public BookingResponse respond(Long id, BookingCompletionResponseRequest request, UUID customerId) {
        requireId(id);
        if (request == null || request.completed() == null || request.completionVersion() == null
                || request.completionVersion() < 0 || (request.reason() != null && request.reason().length() > 1000)) {
            throw new BadRequestException("Phản hồi hoàn thành không hợp lệ.");
        }
        var booking = bookings.findForUpdateById(id).orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy lịch hẹn."));
        if (booking.getCustomer() == null || !booking.getCustomer().getId().equals(customerId)) {
            throw new UnauthorizedException("Bạn chỉ có thể phản hồi lịch hẹn của mình.");
        }
        if (booking.getStatus() != BookingStatus.COMPLETED || booking.getCompletionVersion() != request.completionVersion()) {
            throw new BadRequestException("Trạng thái lịch hẹn đã thay đổi. Vui lòng tải lại trước khi phản hồi.");
        }
        var state = booking.effectiveCompletionConfirmation();
        if ((request.completed() && (state == CompletionConfirmation.CONFIRMED || state == CompletionConfirmation.ADMIN_CONFIRMED))
                || (!request.completed() && state == CompletionConfirmation.DISPUTED)) return bookingService.mapToBookingResponse(booking);
        if (state != CompletionConfirmation.PENDING) {
            throw new BadRequestException("Lịch hẹn đã có phản hồi hoặc kết luận. Không thể gửi phản hồi trái ngược.");
        }
        String reason = request.reason() == null ? "" : request.reason().strip();
        if (!request.completed() && reason.isEmpty()) throw new BadRequestException("Vui lòng nhập lý do dịch vụ chưa hoàn thành.");
        freezeLegacyCompletion(booking);
        LocalDateTime now = now();
        booking.setCompletionRespondedAt(now);
        booking.setCompletionConfirmation(request.completed() ? CompletionConfirmation.CONFIRMED : CompletionConfirmation.DISPUTED);
        booking.setCompletionCustomerNote(request.completed() ? null : reason);
        if (!request.completed()) {
            disputes.save(BookingCompletionDispute.builder().booking(booking).completionVersion(booking.getCompletionVersion())
                    .reason(reason).status(BookingCompletionDisputeStatus.OPEN).createdAt(now).build());
        }
        bookings.save(booking);
        return bookingService.mapToBookingResponse(booking);
    }

    // Keep a legacy report's original revenue bucket when auditing updates updatedAt.
    private void freezeLegacyCompletion(Booking booking) {
        if (booking.getCompletedAt() == null) {
            booking.setCompletedAt(booking.getUpdatedAt() == null ? booking.getScheduledAt() : booking.getUpdatedAt());
            booking.setRevenueEstimated(true);
        }
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('ADMIN')")
    public PageResponse<BookingCompletionDisputeResponse> list(String status, int page, int size) {
        if (page < 0 || size < 1 || size > 100) throw new BadRequestException("Thông số phân trang không hợp lệ.");
        var pageable = PageRequest.of(page, size, Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id")));
        Page<BookingCompletionDispute> result;
        if (status == null) result = disputes.findAll(pageable);
        else {
            BookingCompletionDisputeStatus filter;
            try { filter = BookingCompletionDisputeStatus.valueOf(status); }
            catch (IllegalArgumentException ex) { throw new BadRequestException("Trạng thái báo cáo không hợp lệ."); }
            result = disputes.findByStatus(filter, pageable);
        }
        return PageResponse.of(result.getContent().stream().map(this::map).toList(), result);
    }

    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('ADMIN')")
    public BookingCompletionDisputeResponse get(Long id) {
        requireId(id);
        return map(disputes.findById(id).orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy báo cáo.")));
    }

    @Transactional
    @PreAuthorize("hasRole('ADMIN')")
    public BookingCompletionDisputeResponse resolve(Long id, BookingCompletionResolutionRequest request, UUID adminId) {
        requireId(id);
        if (request == null || request.outcome() == null || request.outcome() == BookingCompletionDisputeStatus.OPEN
                || request.note() == null || request.note().isBlank() || request.note().length() > 2000) {
            throw new BadRequestException("Chọn kết quả xử lý và nhập kết luận không quá 2000 ký tự.");
        }
        // Scalar lookup avoids caching stale case/booking entities before acquiring their locks.
        var target = disputes.findTargetById(id).orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy báo cáo."));
        salons.findForUpdateById(target.getSalonId()).orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy tiệm."));
        var booking = bookings.findForUpdateById(target.getBookingId()).orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy lịch hẹn."));
        var dispute = disputes.findForUpdateById(id).orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy báo cáo."));
        String note = request.note().strip();
        if (dispute.getStatus() != BookingCompletionDisputeStatus.OPEN) {
            if (dispute.getStatus() == request.outcome() && Objects.equals(dispute.getAdminNote(), note)) return map(dispute);
            throw new BadRequestException("Báo cáo đã được xử lý. Vui lòng tải lại để xem kết luận.");
        }
        if (booking.getStatus() != BookingStatus.COMPLETED || booking.getCompletionVersion() != dispute.getCompletionVersion()
                || booking.effectiveCompletionConfirmation() != CompletionConfirmation.DISPUTED) {
            throw new BadRequestException("Lịch hẹn đã thay đổi so với báo cáo. Vui lòng tải lại trước khi xử lý.");
        }
        LocalDateTime now = now();
        if (request.outcome() == BookingCompletionDisputeStatus.REOPENED) ensureReopenAvailable(booking, now);
        freezeLegacyCompletion(booking);
        booking.setCompletionAdminNote(note); booking.setCompletionResolvedAt(now);
        if (request.outcome() == BookingCompletionDisputeStatus.UPHELD) {
            booking.setCompletionConfirmation(CompletionConfirmation.ADMIN_CONFIRMED);
        } else {
            booking.setStatus(BookingStatus.IN_PROGRESS); booking.setCompletedAt(null);
            booking.setCompletionConfirmation(CompletionConfirmation.REOPENED);
        }
        dispute.setStatus(request.outcome()); dispute.setAdminNote(note);
        dispute.setResolvedAt(now); dispute.setResolvedBy(adminId);
        bookings.save(booking); disputes.save(dispute);
        return map(dispute);
    }

    private void ensureReopenAvailable(Booking booking, LocalDateTime now) {
        LocalDateTime end = booking.getScheduledAt().plusMinutes(booking.getDurationMinutes());
        if (!end.isAfter(now)) return; // Historical correction does not create a new appointment/time slot.
        boolean conflict = bookings.findOverlapping(booking.getSalon().getId(), booking.getScheduledAt(), end).stream()
                .filter(other -> !Objects.equals(other.getId(), booking.getId()))
                .anyMatch(other -> booking.getEmployee() == null || other.getEmployee() == null
                        || Objects.equals(other.getEmployee().getId(), booking.getEmployee().getId()));
        if (conflict) throw new BadRequestException("Khung giờ gốc đã có lịch khác của nhân viên. Vui lòng liên hệ hai bên để sắp xếp trước khi trả lịch về đang thực hiện.");
    }

    private BookingCompletionDisputeResponse map(BookingCompletionDispute dispute) {
        var booking = dispute.getBooking(); var salon = booking.getSalon(); var owner = salon.getOwner();
        var customer = booking.getCustomer();
        String phone = booking.getCustomerPhone();
        if ((phone == null || phone.isBlank()) && customer != null) phone = customer.getPhone();
        return BookingCompletionDisputeResponse.builder()
                .id(dispute.getId()).bookingId(booking.getId()).completionVersion(dispute.getCompletionVersion())
                .status(dispute.getStatus()).reason(dispute.getReason()).createdAt(dispute.getCreatedAt())
                .resolvedAt(dispute.getResolvedAt()).resolvedBy(dispute.getResolvedBy()).adminNote(dispute.getAdminNote())
                .customerName(customer == null ? booking.getWalkInName() : customer.getFullName())
                .customerPhone(phone).customerEmail(customer == null ? null : customer.getEmail())
                .salonId(salon.getId()).salonName(salon.getName()).salonPhone(salon.getPhone())
                .salonEmail(salon.getEmail()).salonAddress(salon.getAddress())
                .ownerName(owner == null ? null : owner.getFullName()).ownerPhone(owner == null ? null : owner.getPhone())
                .ownerEmail(owner == null ? null : owner.getEmail()).serviceName(booking.getService().getName())
                .servicePrice(booking.getServicePriceSnapshot() == null ? booking.getService().getPrice() : booking.getServicePriceSnapshot())
                .scheduledAt(booking.getScheduledAt()).durationMinutes(booking.getDurationMinutes())
                .employeeName(booking.getEmployee() == null ? null : booking.getEmployee().getFullName())
                .bookingStatus(booking.getStatus()).completedAt(booking.getCompletedAt()).build();
    }
}
