package com.bookingnailms.controller.booking;

import com.bookingnailms.dto.booking.*;
import com.bookingnailms.dto.common.*;
import com.bookingnailms.service.BookingCompletionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;

@RestController @RequiredArgsConstructor
public class BookingCompletionController {
    private final BookingCompletionService completion;

    @PostMapping("/bookings/{id}/completion-response")
    public ApiResponse<BookingResponse> respond(@PathVariable Long id,
            @Valid @RequestBody BookingCompletionResponseRequest request, @AuthenticationPrincipal Jwt jwt) {
        return ApiResponse.success(completion.respond(id, request, UUID.fromString(jwt.getSubject())), "Đã ghi nhận phản hồi của bạn.");
    }

    @GetMapping("/admin/booking-disputes")
    public ApiResponse<PageResponse<BookingCompletionDisputeResponse>> list(@RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.success(completion.list(status, page, size), null);
    }

    @GetMapping("/admin/booking-disputes/{id}")
    public ApiResponse<BookingCompletionDisputeResponse> get(@PathVariable Long id) {
        return ApiResponse.success(completion.get(id), null);
    }

    @PatchMapping("/admin/booking-disputes/{id}/resolution")
    public ApiResponse<BookingCompletionDisputeResponse> resolve(@PathVariable Long id,
            @Valid @RequestBody BookingCompletionResolutionRequest request, @AuthenticationPrincipal Jwt jwt) {
        return ApiResponse.success(completion.resolve(id, request, UUID.fromString(jwt.getSubject())), "Đã lưu kết luận xử lý.");
    }
}
