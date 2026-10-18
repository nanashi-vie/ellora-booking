package com.bookingnailms.repository;

import com.bookingnailms.entity.SalonSubscriptionRequest;
import com.bookingnailms.enums.SubscriptionRequestStatus;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface SalonSubscriptionRequestRepository extends JpaRepository<SalonSubscriptionRequest, Long> {
    boolean existsBySalonIdAndStatus(Long salonId, SubscriptionRequestStatus status);
    Optional<SalonSubscriptionRequest> findFirstBySalonIdAndStatusOrderByIdDesc(Long salonId, SubscriptionRequestStatus status);
    @EntityGraph(attributePaths = "salon") Page<SalonSubscriptionRequest> findBySalonId(Long salonId, Pageable pageable);
    @EntityGraph(attributePaths = "salon") Page<SalonSubscriptionRequest> findByStatus(SubscriptionRequestStatus status, Pageable pageable);
    @Override @EntityGraph(attributePaths = "salon") Page<SalonSubscriptionRequest> findAll(Pageable pageable);
    @Query("select r.salon.id from SalonSubscriptionRequest r where r.id = :id")
    Optional<Long> findSalonIdById(@Param("id") Long id);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from SalonSubscriptionRequest r where r.id = :id")
    Optional<SalonSubscriptionRequest> findForUpdate(@Param("id") Long id);
}
