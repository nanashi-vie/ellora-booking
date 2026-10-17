package com.bookingnailms.dto.booking;

import jakarta.validation.constraints.*;

public record BookingCompletionResponseRequest(
        @NotNull Boolean completed,
        @Size(max = 1000) String reason,
        @NotNull @PositiveOrZero Long completionVersion) {}
