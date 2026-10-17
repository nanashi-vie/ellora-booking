package com.bookingnailms.controller.booking;

import com.bookingnailms.dto.booking.GuestBookingRequest;
import com.bookingnailms.dto.booking.GuestBookingReceipt;
import com.bookingnailms.dto.common.ApiResponse;
import com.bookingnailms.service.BookingService;
import com.bookingnailms.service.GuestBookingRequestLimiter;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
public class GuestBookingController {
    private final BookingService bookings;
    private final GuestBookingRequestLimiter limiter;

    @PostMapping("/bookings/guest")
    public ResponseEntity<ApiResponse<GuestBookingReceipt>> create(@Valid @RequestBody GuestBookingRequest request) {
        limiter.check(request.email());
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success(
                bookings.createGuestBooking(request), "Đã nhận yêu cầu đặt lịch. Vui lòng chờ tiệm xác nhận qua email."));
    }
}
