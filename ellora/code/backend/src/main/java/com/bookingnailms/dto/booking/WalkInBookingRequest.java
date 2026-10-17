package com.bookingnailms.dto.booking;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Pattern;
import java.time.LocalDateTime;

public record WalkInBookingRequest(
        @NotNull Long serviceId, Long employeeId, @NotNull LocalDateTime scheduledAt,
        @Size(max = 255) String customerName,
        @Pattern(regexp = "^$|^[+0-9 ()-]{8,20}$") String customerPhone,
        @Size(max = 1000) String customerNote) {}
