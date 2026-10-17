package com.bookingnailms.dto.booking;

import com.bookingnailms.enums.BookingCompletionDisputeStatus;
import jakarta.validation.constraints.*;

public record BookingCompletionResolutionRequest(
        @NotNull BookingCompletionDisputeStatus outcome,
        @NotBlank @Size(max = 2000) String note) {}
