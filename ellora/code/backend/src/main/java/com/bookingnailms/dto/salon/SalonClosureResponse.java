package com.bookingnailms.dto.salon;

import java.time.LocalDate;

public record SalonClosureResponse(Long id, LocalDate date, String reason) {}
