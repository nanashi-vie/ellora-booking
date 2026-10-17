package com.bookingnailms.dto.booking;

import com.bookingnailms.enums.BookingStatus;
import java.time.LocalDateTime;

public record GuestBookingReceipt(Long id, BookingStatus status, LocalDateTime scheduledAt,
        String salonName, String serviceName) {}
