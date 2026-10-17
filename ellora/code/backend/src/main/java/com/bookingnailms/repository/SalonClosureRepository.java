package com.bookingnailms.repository;

import com.bookingnailms.entity.SalonClosure;
import org.springframework.data.jpa.repository.JpaRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface SalonClosureRepository extends JpaRepository<SalonClosure, Long> {
    boolean existsBySalonIdAndDate(Long salonId, LocalDate date);
    Optional<SalonClosure> findBySalonIdAndDate(Long salonId, LocalDate date);
    List<SalonClosure> findBySalonIdAndDateGreaterThanEqualOrderByDate(Long salonId, LocalDate from);
    List<SalonClosure> findBySalonIdAndDateBetweenOrderByDate(Long salonId, LocalDate from, LocalDate to);
}
