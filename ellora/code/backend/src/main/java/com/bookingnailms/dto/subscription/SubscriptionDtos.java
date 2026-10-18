package com.bookingnailms.dto.subscription;

import com.bookingnailms.enums.SubscriptionTier;
import com.bookingnailms.enums.SubscriptionRequestStatus;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

public final class SubscriptionDtos {
    private SubscriptionDtos() {}
    public record Plan(SubscriptionTier tier, String displayName, String badgeLabel, BigDecimal monthlyPrice,
            String currency, boolean enabled, int termMonths, boolean registrationAvailable) {}
    public record State(Long salonId, SubscriptionTier effectiveTier, String badgeLabel, LocalDateTime startsAt,
            LocalDateTime expiresAt, Request pendingRequest) {}
    public record Request(Long id, Long salonId, String salonName, SubscriptionTier tier, BigDecimal quotedPrice,
            SubscriptionRequestStatus status, LocalDateTime createdAt, LocalDateTime reviewedAt, String reviewNote,
            LocalDateTime startsAt, LocalDateTime expiresAt, String paymentQrUrl, String transferContent,
            LocalDateTime paymentReportedAt, String paymentReference, LocalDateTime paymentConfirmedAt, BigDecimal receivedAmount) {}
    public record Create(@NotNull SubscriptionTier tier,
            @NotNull @DecimalMin("1") @Digits(integer = 15, fraction = 0) BigDecimal expectedPrice) {}
    public record PlanUpdate(@DecimalMin("0") @Digits(integer = 15, fraction = 0) BigDecimal monthlyPrice,
            @NotNull Boolean enabled) {
        @AssertTrue(message = "Gói đang mở cần có giá lớn hơn 0 VNĐ.")
        public boolean isEnabledPriceValid() { return !Boolean.TRUE.equals(enabled) || monthlyPrice != null && monthlyPrice.signum() > 0; }
    }
    public record PaymentReport(@Size(max = 100) String reference) {}
    public record Decision(@NotNull SubscriptionRequestStatus status, @Size(max = 1000) String note,
            Boolean paymentReceived, @DecimalMin("1") @Digits(integer = 15, fraction = 0) BigDecimal expectedAmount) {
        public Decision(SubscriptionRequestStatus status, String note) { this(status,note,null,null); }
        @AssertTrue(message = "Chỉ được duyệt hoặc từ chối yêu cầu.")
        public boolean isFinalStatus() { return status == SubscriptionRequestStatus.APPROVED || status == SubscriptionRequestStatus.REJECTED; }
    }
}
