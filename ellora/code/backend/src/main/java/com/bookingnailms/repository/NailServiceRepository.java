package com.bookingnailms.repository;

import com.bookingnailms.entity.NailService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface NailServiceRepository extends JpaRepository<NailService, Long> {

    @org.springframework.data.jpa.repository.EntityGraph(attributePaths = "category")
    List<NailService> findBySalonIdAndActiveTrue(Long salonId);

    Page<NailService> findBySalonId(Long salonId, Pageable pageable);

    List<NailService> findByCategoryIdAndActiveTrue(Long categoryId);
}
