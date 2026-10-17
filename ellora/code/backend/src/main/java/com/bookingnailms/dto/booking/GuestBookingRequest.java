package com.bookingnailms.dto.booking;

import jakarta.validation.constraints.*;
import java.time.LocalDateTime;

public record GuestBookingRequest(
        @NotNull @Positive Long salonId,
        @NotNull @Positive Long serviceId,
        @Positive Long employeeId,
        @NotNull(message = "Vui lòng chọn ngày và giờ hẹn") LocalDateTime scheduledAt,
        @NotBlank(message = "Vui lòng nhập họ tên") @Size(max = 255) String fullName,
        @NotBlank(message = "Vui lòng nhập số điện thoại")
        @Pattern(regexp = "^(?=.*[0-9])[+0-9 ()-]{8,20}$", message = "Số điện thoại phải có 8–20 ký tự hợp lệ") String phone,
        @NotBlank(message = "Vui lòng nhập email") @Email(message = "Email không hợp lệ") @Size(max = 254) String email,
        @Size(max = 1000) String customerNote) {}
