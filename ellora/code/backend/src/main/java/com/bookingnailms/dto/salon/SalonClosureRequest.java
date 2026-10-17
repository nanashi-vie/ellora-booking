package com.bookingnailms.dto.salon;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record SalonClosureRequest(@NotNull LocalDate date, @Size(max = 500) String reason) {}
