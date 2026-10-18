package com.bookingnailms.dto.salon;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.math.BigDecimal;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SalonSummaryResponse {

    private Long id;
    private String name;
    private String address;
    private String city;
    private String logoUrl;
    private BigDecimal averageRating;
    private Integer totalReviews;
    private String district;
    private Double latitude;
    private Double longitude;
    private Double distanceKm;
    private com.bookingnailms.enums.SubscriptionTier subscriptionTier;
    private String subscriptionBadge;
}
