package com.bookingnailms.dto.booking;

import com.bookingnailms.enums.BookingCompletionDisputeStatus;
import com.bookingnailms.enums.BookingStatus;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class BookingCompletionDisputeResponse {
    private Long id;
    private Long bookingId;
    private long completionVersion;
    private BookingCompletionDisputeStatus status;
    private String reason;
    private LocalDateTime createdAt;
    private LocalDateTime resolvedAt;
    private UUID resolvedBy;
    private String adminNote;
    private String customerName;
    private String customerPhone;
    private String customerEmail;
    private Long salonId;
    private String salonName;
    private String salonPhone;
    private String salonEmail;
    private String salonAddress;
    private String ownerName;
    private String ownerPhone;
    private String ownerEmail;
    private String serviceName;
    private BigDecimal servicePrice;
    private LocalDateTime scheduledAt;
    private Integer durationMinutes;
    private String employeeName;
    private BookingStatus bookingStatus;
    private LocalDateTime completedAt;
}
