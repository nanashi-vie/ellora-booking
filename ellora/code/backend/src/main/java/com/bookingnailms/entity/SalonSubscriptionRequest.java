package com.bookingnailms.entity;

import com.bookingnailms.enums.SubscriptionTier;
import com.bookingnailms.enums.SubscriptionRequestStatus;
import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity @Table(name = "salon_subscription_requests")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class SalonSubscriptionRequest {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "salon_id", nullable = false) private Salon salon;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) private SubscriptionTier tier;
    @Column(nullable = false, precision = 15, scale = 0) private BigDecimal quotedPrice;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16) private SubscriptionRequestStatus status;
    @Column(nullable = false) private LocalDateTime createdAt;
    private LocalDateTime reviewedAt;
    @Column(length = 1000) private String reviewNote;
    private UUID reviewedBy;
    private LocalDateTime startsAt;
    private LocalDateTime expiresAt;
    @Column(columnDefinition = "TEXT") private String paymentQrUrl;
    private LocalDateTime paymentReportedAt;
    @Column(length = 100) private String paymentReference;
    private LocalDateTime paymentConfirmedAt;
    private UUID paymentConfirmedBy;
    @Column(precision = 15, scale = 0) private BigDecimal receivedAmount;
}
