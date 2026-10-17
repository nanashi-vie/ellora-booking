package com.bookingnailms.dto.booking;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class BookingRequest {

    @NotNull(message = "Salon không được để trống")
    private Long salonId;

    @NotNull(message = "Dịch vụ không được để trống")
    private Long serviceId;

    private Long employeeId;

    @NotNull(message = "Thời gian hẹn không được để trống")
    private LocalDateTime scheduledAt;

    @Size(max = 1000, message = "Ghi chú không được vượt quá 1000 ký tự")
    private String customerNote;

    @Pattern(regexp = "^$|^(?=.*[0-9])[+0-9 ()-]{8,20}$", message = "Số điện thoại phải có 8–20 ký tự hợp lệ và ít nhất một chữ số.")
    private String customerPhone;

    public BookingRequest(Long salonId, Long serviceId, Long employeeId, LocalDateTime scheduledAt, String customerNote) {
        this(salonId, serviceId, employeeId, scheduledAt, customerNote, null);
    }
}
