package com.bookingnailms.repository;

import com.bookingnailms.entity.BookingCompletionDispute;
import com.bookingnailms.enums.BookingCompletionDisputeStatus;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.Optional;

public interface BookingCompletionDisputeRepository extends JpaRepository<BookingCompletionDispute, Long> {
    @Override
    @EntityGraph(attributePaths = {"booking", "booking.customer", "booking.salon", "booking.salon.owner", "booking.service", "booking.employee"})
    Page<BookingCompletionDispute> findAll(Pageable pageable);

    @EntityGraph(attributePaths = {"booking", "booking.customer", "booking.salon", "booking.salon.owner", "booking.service", "booking.employee"})
    Page<BookingCompletionDispute> findByStatus(BookingCompletionDisputeStatus status, Pageable pageable);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from BookingCompletionDispute d where d.id = :id")
    Optional<BookingCompletionDispute> findForUpdateById(@Param("id") Long id);

    interface ResolutionTarget { Long getBookingId(); Long getSalonId(); }
    @Query("select d.booking.id as bookingId, d.booking.salon.id as salonId from BookingCompletionDispute d where d.id = :id")
    Optional<ResolutionTarget> findTargetById(@Param("id") Long id);
}
