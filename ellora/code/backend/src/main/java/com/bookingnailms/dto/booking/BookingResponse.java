package com.bookingnailms.dto.booking;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import com.bookingnailms.enums.BookingStatus;
import com.bookingnailms.enums.CompletionConfirmation;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BookingResponse {
    private Long id;
    private Long salonId;
    private String salonName;
    private String salonLogoUrl;
    private String customerName;
    private String customerPhone;
    private boolean walkIn;
    private Long serviceId;
    private String serviceName;
    private java.math.BigDecimal servicePrice;
    private Long employeeId;
    private String employeeName;
    private LocalDateTime scheduledAt;
    private Integer durationMinutes;
    private BookingStatus status;
    private boolean reviewed;
    private Integer reviewRating;
    private String customerNote;
    private String salonNote;
    private String cancellationReason;
    private LocalDateTime createdAt;
    private CompletionConfirmation completionConfirmation;
    private long completionVersion;
    private LocalDateTime completionRespondedAt;
    private String completionCustomerNote;
    private String completionAdminNote;
    private LocalDateTime completionResolvedAt;
}
