package com.bookingnailms.service;

import com.bookingnailms.dto.common.PageResponse;
import com.bookingnailms.dto.salon.SalonRequest;
import com.bookingnailms.dto.salon.SalonResponse;
import com.bookingnailms.dto.salon.SalonSummaryResponse;
import com.bookingnailms.dto.salon.SalonSearchRequest;
import com.bookingnailms.entity.Salon;
import com.bookingnailms.entity.User;
import com.bookingnailms.enums.SalonStatus;
import com.bookingnailms.exception.BadRequestException;
import com.bookingnailms.exception.ResourceNotFoundException;
import com.bookingnailms.repository.SalonRepository;
import com.bookingnailms.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

@Service
public class SalonService {

    private final SalonRepository salonRepository;
    private final UserRepository userRepository;
    private final Clock clock;

    @Autowired
    public SalonService(SalonRepository salonRepository, UserRepository userRepository) {
        this(salonRepository, userRepository, Clock.systemUTC());
    }

    public SalonService(SalonRepository salonRepository, UserRepository userRepository, Clock clock) {
        this.salonRepository = salonRepository;
        this.userRepository = userRepository;
        this.clock = clock;
    }

    @Transactional
    public SalonResponse createSalon(SalonRequest request, UUID ownerId) {
        User owner = userRepository.findForUpdateById(ownerId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", ownerId));

        if (owner.getRole() != com.bookingnailms.enums.Role.CUSTOMER || !owner.isEnabled() || owner.isLocked()) {
            throw new org.springframework.security.access.AccessDeniedException("Account cannot register a salon");
        }
        if (!request.isCoordinatesValid()) throw new BadRequestException("Vui lòng chọn đủ vĩ độ và kinh độ hợp lệ.");

        if (salonRepository.existsByOwnerId(ownerId)) {
            throw new BadRequestException("You already have a salon registered");
        }

        Salon salon = Salon.builder()
                .name(request.getName())
                .description(request.getDescription())
                .address(request.getAddress())
                .city(request.getCity())
                .district(request.getDistrict())
                .phone(request.getPhone())
                .email(request.getEmail())
                .latitude(request.getLatitude())
                .longitude(request.getLongitude())
                .status(SalonStatus.PENDING_APPROVAL)
                .averageRating(BigDecimal.ZERO)
                .totalReviews(0)
                .owner(owner)
                .build();

        salon = salonRepository.save(salon);
        return mapToSalonResponse(salon);
    }

    @Transactional(readOnly = true)
    public SalonResponse getSalonById(Long id) {
        Salon salon = salonRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Salon", "id", id));
        return mapToSalonResponse(salon);
    }

    @Transactional(readOnly = true)
    public PageResponse<SalonSummaryResponse> searchSalons(String keyword, Pageable pageable) {
        return searchSalons(new SalonSearchRequest(keyword, null, null, null, null, null, null, "newest"), pageable);
    }

    @Transactional(readOnly = true)
    public PageResponse<SalonSummaryResponse> searchSalons(SalonSearchRequest request, Pageable pageable) {
        String keyword = searchText(request.keyword());
        String location = searchText(request.location());
        String sort = request.sort() == null ? "newest" : request.sort();
        boolean hasCenter = request.latitude() != null || request.longitude() != null;
        if (hasCenter && (request.latitude() == null || request.longitude() == null
                || !Double.isFinite(request.latitude()) || !Double.isFinite(request.longitude())
                || Math.abs(request.latitude()) > 90 || Math.abs(request.longitude()) > 180)) {
            throw new BadRequestException("Vui lòng chọn đủ vĩ độ và kinh độ hợp lệ.");
        }
        if (request.radiusKm() != null && (!hasCenter || !Double.isFinite(request.radiusKm())
                || request.radiusKm() <= 0 || request.radiusKm() > 100)) {
            throw new BadRequestException("Bán kính cần lớn hơn 0, tối đa 100 km và có vị trí tìm kiếm.");
        }
        if (!java.util.Set.of("newest", "rating", "distance").contains(sort)
                || ("distance".equals(sort) && !hasCenter)) {
            throw new BadRequestException("Cách sắp xếp không hợp lệ hoặc chưa chọn vị trí.");
        }
        var now = LocalDateTime.ofInstant(clock.instant(), ZoneId.of("Asia/Ho_Chi_Minh"));
        var minimum = now.plusHours(1);
        var earliestMinute = minimum.truncatedTo(ChronoUnit.MINUTES);
        if (earliestMinute.isBefore(minimum)) earliestMinute = earliestMinute.plusMinutes(1);
        if (request.date() != null && (request.date().isBefore(now.toLocalDate())
                || request.date().isAfter(now.toLocalDate().plusYears(1)))) {
            throw new BadRequestException("Ngày tìm kiếm cần từ hôm nay đến tối đa một năm tới.");
        }
        if (request.time() != null && (request.date() == null || request.time().getSecond() != 0
                || request.time().getNano() != 0 || request.date().atTime(request.time()).isBefore(earliestMinute))) {
            throw new BadRequestException("Chọn ngày và giờ chính xác đến phút, trước lịch ít nhất 1 giờ.");
        }
        if (pageable.getOffset() > Integer.MAX_VALUE) throw new BadRequestException("Trang tìm kiếm quá lớn.");
        var filters = new SalonSearchRequest(keyword, location, request.date(), request.time(),
                request.latitude(), request.longitude(), request.radiusKm(), sort);
        return PageResponse.of(salonRepository.searchPublic(filters, earliestMinute, now, pageable));
    }

    private String searchText(String value) {
        String text = value == null ? "" : java.text.Normalizer.normalize(value.strip(), java.text.Normalizer.Form.NFC);
        if (text.length() > 255) throw new BadRequestException("Từ khóa và địa điểm tối đa 255 ký tự.");
        return text;
    }

    @Transactional(readOnly = true)
    public SalonResponse getMySalon(UUID ownerId) {
        Salon salon = salonRepository.findByOwnerId(ownerId)
                .orElseThrow(() -> new ResourceNotFoundException("Salon not found for current owner"));
        return mapToSalonResponse(salon);
    }

    @Transactional(readOnly = true)
    public Long getMySalonId(UUID ownerId) {
        return salonRepository.findIdByOwnerId(ownerId)
                .orElseThrow(() -> new ResourceNotFoundException("Salon not found for current owner"));
    }

    @Transactional(readOnly = true)
    public void requireActiveSalon(Long id) {
        if (!salonRepository.existsByIdAndStatus(id,SalonStatus.ACTIVE)) {
            throw new ResourceNotFoundException("Salon not found");
        }
    }

    private SalonResponse mapToSalonResponse(Salon salon) {
        var effectiveTier = salon.effectiveSubscriptionTier(LocalDateTime.ofInstant(clock.instant(), ZoneId.of("Asia/Ho_Chi_Minh")));
        return SalonResponse.builder()
                .id(salon.getId())
                .name(salon.getName())
                .description(salon.getDescription())
                .address(salon.getAddress())
                .city(salon.getCity())
                .district(salon.getDistrict())
                .phone(salon.getPhone())
                .email(salon.getEmail())
                .logoUrl(salon.getLogoUrl())
                .imageUrls(new java.util.ArrayList<>(salon.getImageUrls()))
                .status(salon.getStatus())
                .latitude(salon.getLatitude())
                .longitude(salon.getLongitude())
                .averageRating(salon.getAverageRating())
                .totalReviews(salon.getTotalReviews())
                .ownerId(salon.getOwner().getId())
                .ownerName(salon.getOwner().getFullName())
                .serviceCount(salon.getServices() != null ? salon.getServices().size() : 0)
                .createdAt(salon.getCreatedAt())
                .updatedAt(salon.getUpdatedAt())
                .subscriptionTier(effectiveTier)
                .subscriptionBadge(effectiveTier == null ? null : effectiveTier.badgeLabel())
                .build();
    }

}
