package com.bookingnailms.repository;

import com.bookingnailms.entity.SalonSubscriptionPlan;
import com.bookingnailms.enums.SubscriptionTier;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface SalonSubscriptionPlanRepository extends JpaRepository<SalonSubscriptionPlan, SubscriptionTier> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from SalonSubscriptionPlan p where p.tier = :tier")
    Optional<SalonSubscriptionPlan> findForUpdate(@Param("tier") SubscriptionTier tier);
}
