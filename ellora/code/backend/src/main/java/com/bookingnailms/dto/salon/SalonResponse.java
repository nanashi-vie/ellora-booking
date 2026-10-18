package com.bookingnailms.dto.salon;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import com.bookingnailms.enums.SalonStatus;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SalonResponse {
    private Long id;
    private String name;
    private String description;
    private String address;
    private String city;
    private String district;
    private String phone;
    private String email;
    private String logoUrl;
    private List<String> imageUrls;
    private SalonStatus status;
    private Double latitude;
    private Double longitude;
    private BigDecimal averageRating;
    private Integer totalReviews;
    private UUID ownerId;
    private String ownerName;
    private Integer serviceCount;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private com.bookingnailms.enums.SubscriptionTier subscriptionTier;
    private String subscriptionBadge;
}
