package com.bookingnailms.repository;

import com.bookingnailms.dto.salon.SalonSearchRequest;
import com.bookingnailms.dto.salon.SalonSummaryResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;

public interface SalonSearchRepository {
    Page<SalonSummaryResponse> searchPublic(SalonSearchRequest filters, LocalDateTime earliestBookable, Pageable pageable);
}
