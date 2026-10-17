package com.bookingnailms.controller.booking;

import com.bookingnailms.dto.booking.BookingRequest;
import com.bookingnailms.dto.booking.BookingResponse;
import com.bookingnailms.dto.booking.BookingStatusUpdateRequest;
import com.bookingnailms.dto.booking.WalkInBookingRequest;
import com.bookingnailms.dto.common.ApiResponse;
import com.bookingnailms.dto.common.PageResponse;
import com.bookingnailms.enums.BookingStatus;
import com.bookingnailms.service.BookingService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequiredArgsConstructor
@Tag(name = "Booking", description = "API quản lý đặt lịch")
public class BookingController {

    private final BookingService bookingService;
    private final com.bookingnailms.repository.SalonRepository salonRepository;

    // ──────────────────────────────────────────────────────────────────────────
    // CUSTOMER endpoints
    // ──────────────────────────────────────────────────────────────────────────

    @Operation(
            summary = "Tạo booking mới",
            description = "Khách hàng đặt lịch cho một dịch vụ tại salon. Chỉ cần 1 serviceId mỗi lần đặt."
    )
    @PostMapping("/bookings")
    public ResponseEntity<ApiResponse<BookingResponse>> createBooking(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody BookingRequest request) {

        UUID customerId = UUID.fromString(jwt.getSubject());
        BookingResponse response = bookingService.createBooking(request, customerId);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(response, "Đặt lịch thành công. Vui lòng chờ xác nhận từ salon."));
    }

    @Operation(
            summary = "Xem lịch sử đặt lịch của tôi",
            description = "Trả về danh sách các booking của khách hàng đang đăng nhập, sắp xếp theo thời gian tạo mới nhất."
    )
    @GetMapping("/bookings/my")
    public ResponseEntity<ApiResponse<PageResponse<BookingResponse>>> getMyBookings(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "10") int size) {

        UUID customerId = UUID.fromString(jwt.getSubject());
        Pageable pageable = safePage(page, size, 100);
        PageResponse<BookingResponse> result = bookingService.getMyBookings(customerId, pageable);
        return ResponseEntity.ok(ApiResponse.success(result, null));
    }

    @Operation(
            summary = "Hủy booking",
            description = "Khách hàng hủy booking của chính họ. Không thể hủy nếu booking đã COMPLETED hoặc CANCELLED."
    )
    @DeleteMapping("/bookings/{id}")
    public ResponseEntity<ApiResponse<Void>> cancelBooking(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long id) {

        UUID customerId = UUID.fromString(jwt.getSubject());
        bookingService.cancelBooking(id, customerId);
        return ResponseEntity.ok(ApiResponse.success(null, "Đã hủy lịch hẹn thành công."));
    }

    // ──────────────────────────────────────────────────────────────────────────
    // OWNER endpoints
    // ──────────────────────────────────────────────────────────────────────────

    @Operation(
            summary = "Xem danh sách booking của salon (Owner)",
            description = "Chủ salon xem tất cả booking của salon mình. Có thể lọc theo trạng thái."
    )
    @GetMapping("/owner/bookings")
    public ResponseEntity<ApiResponse<PageResponse<BookingResponse>>> getSalonBookings(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam Long salonId,
            @RequestParam(required = false) BookingStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        var salon = salonRepository.findById(salonId)
                .orElseThrow(() -> new com.bookingnailms.exception.ResourceNotFoundException("Salon not found"));
        if (!salon.getOwner().getId().equals(UUID.fromString(jwt.getSubject()))) {
            throw new org.springframework.security.access.AccessDeniedException("Not your salon");
        }
        Pageable pageable = safePage(page, size, 100);
        PageResponse<BookingResponse> result = bookingService.getSalonBookings(salonId, status, pageable);
        return ResponseEntity.ok(ApiResponse.success(result, null));
    }

    private Pageable safePage(int page, int size, int maxSize) {
        if (page < 0 || size < 1 || size > maxSize) {
            throw new com.bookingnailms.exception.BadRequestException("Thông số phân trang không hợp lệ.");
        }
        return PageRequest.of(page, size);
    }

    @Operation(
            summary = "Cập nhật trạng thái booking (Owner)",
            description = "Chủ salon xác nhận (CONFIRMED), từ chối (REJECTED), hoặc đánh dấu hoàn thành (COMPLETED) một booking."
    )
    @PatchMapping("/owner/bookings/{id}/status")
    public ResponseEntity<ApiResponse<BookingResponse>> updateBookingStatus(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable Long id,
            @Valid @RequestBody BookingStatusUpdateRequest request) {

        UUID ownerId = UUID.fromString(jwt.getSubject());
        BookingResponse response = bookingService.updateBookingStatus(id, request, ownerId);
        return ResponseEntity.ok(ApiResponse.success(response, "Cập nhật trạng thái thành công."));
    }
    @PostMapping("/owner/bookings/walk-ins")
    public ResponseEntity<ApiResponse<BookingResponse>> createWalkIn(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody WalkInBookingRequest request) {
        var booking = bookingService.createWalkIn(request, UUID.fromString(jwt.getSubject()));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success(booking, "Đã thêm lịch cho khách vãng lai."));
    }

}
