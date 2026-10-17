package com.bookingnailms.dto.salon;

import java.time.LocalDate;
import java.time.LocalTime;

/** Optional filters for the public salon directory; time means opening hours, not slot availability. */
public record SalonSearchRequest(String keyword, String location, LocalDate date, LocalTime time,
        Double latitude, Double longitude, Double radiusKm, String sort) {
}
