package com.bookingnailms.entity;

import com.bookingnailms.enums.SubscriptionTier;
import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity @Table(name = "salon_subscription_plans")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class SalonSubscriptionPlan {
    @Id @Enumerated(EnumType.STRING) @Column(length = 16) private SubscriptionTier tier;
    @Column(precision = 15, scale = 0) private BigDecimal monthlyPrice;
    @Column(nullable = false) private boolean enabled;
    private LocalDateTime updatedAt;
    private UUID updatedBy;
}
