package com.bookingnailms.service;

import com.bookingnailms.dto.common.PageResponse;
import com.bookingnailms.dto.salon.*;
import com.bookingnailms.entity.*;
import com.bookingnailms.entity.SalonProfileChange.Status;
import com.bookingnailms.exception.ResourceNotFoundException;
import com.bookingnailms.exception.BadRequestException;
import com.bookingnailms.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;
import java.util.UUID;
import java.util.List;
import java.util.ArrayList;
import java.util.Objects;
import com.bookingnailms.entity.SalonProfileChange.Kind;

@Service @RequiredArgsConstructor
public class SalonProfileChangeService {
    private final SalonRepository salons;
    private final SalonProfileChangeRepository changes;
    private final jakarta.persistence.EntityManager entityManager;

    @Transactional
    public SalonProfileChangeResponse submit(UUID owner, SalonRequest request) {
        requireValidCoordinates(request);
        Salon owned = owned(owner);
        Salon salon = salons.findForUpdateById(owned.getId()).orElseThrow(() -> missing());
        entityManager.refresh(salon);
        requireNoPending(salon.getId());
        SalonRequest proposed = new SalonRequest(trim(request.getName()), trim(request.getDescription()),
                trim(request.getAddress()), trim(request.getCity()), trim(request.getDistrict()),
                trim(request.getPhone()), trim(request.getEmail()),
                request.getLatitude() == null ? salon.getLatitude() : request.getLatitude(),
                request.getLongitude() == null ? salon.getLongitude() : request.getLongitude());
        if (snapshot(salon).equals(proposed)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Thông tin chưa có thay đổi.");
        }
        SalonProfileChange change = new SalonProfileChange();
        change.setSalon(salon);
        change.setProposed(proposed);
        return response(changes.save(change));
    }

    // Called inside OwnerPhotoService's transaction, after it locks and verifies the salon.
    public void requireNoPending(Long salonId) {
        if (changes.existsBySalonIdAndStatus(salonId, Status.PENDING)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Tiệm đã có yêu cầu chờ duyệt. Vui lòng chờ Admin xử lý.");
        }
    }

    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.MANDATORY)
    public void preparePhotoChange(Salon salon) {
        entityManager.refresh(salon);
        requireNoPending(salon.getId());
    }

    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.MANDATORY)
    public void submitPhoto(Salon salon, Kind kind, String logoUrl, List<String> imageUrls) {
        requireNoPending(salon.getId());
        SalonProfileChange change = new SalonProfileChange();
        change.setSalon(salon); change.setKind(kind); change.setProposed(snapshot(salon));
        change.setPreviousLogoUrl(salon.getLogoUrl());
        change.setPreviousImageUrls(new ArrayList<>(salon.getImageUrls()));
        change.setProposedLogoUrl(logoUrl);
        change.setProposedImageUrls(new ArrayList<>(imageUrls));
        changes.save(change);
    }

    @Transactional(readOnly = true)
    public SalonProfileChangeResponse latest(UUID owner) {
        return changes.findFirstBySalonIdOrderByIdDesc(owned(owner).getId()).map(this::response).orElse(null);
    }

    @Transactional(readOnly = true)
    public PageResponse<SalonProfileChangeResponse> pending(Pageable pageable) {
        return PageResponse.of(changes.findByStatus(Status.PENDING, pageable).map(this::response));
    }

    @Transactional
    public void review(Long id, boolean approve, UUID admin) {
        // Lock the same salon row as submission; concurrent decisions cannot apply twice.
        SalonProfileChange change = changes.findById(id).orElseThrow(() -> missing());
        Salon salon = salons.findForUpdateById(change.getSalon().getId()).orElseThrow(() -> missing());
        // Refresh after waiting for the lock so another admin's decision is visible.
        entityManager.refresh(change);
        if (change.getStatus() != Status.PENDING) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Yêu cầu đã được xử lý. Vui lòng tải lại danh sách.");
        }
        if (approve && change.getKind() == Kind.PROFILE) {
            SalonRequest p = change.getProposed();
            requireValidCoordinates(p);
            salon.setName(p.getName()); salon.setDescription(p.getDescription());
            salon.setAddress(p.getAddress()); salon.setCity(p.getCity()); salon.setDistrict(p.getDistrict());
            salon.setPhone(p.getPhone()); salon.setEmail(p.getEmail());
            // Older pending JSON has no coordinates; approval must preserve the existing pin.
            if (p.getLatitude() != null) {
                salon.setLatitude(p.getLatitude()); salon.setLongitude(p.getLongitude());
            }
            salons.save(salon);
        }
        if (approve && change.getKind() != Kind.PROFILE) {
            boolean unchanged = change.getKind() == Kind.COVER
                    ? Objects.equals(salon.getLogoUrl(), change.getPreviousLogoUrl())
                    : salon.getImageUrls().equals(change.getPreviousImageUrls());
            if (!unchanged) throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Ảnh hiện tại đã được Admin thay đổi. Hãy từ chối yêu cầu cũ để tiệm gửi lại.");
            if (change.getKind() == Kind.COVER) salon.setLogoUrl(change.getProposedLogoUrl());
            else { salon.getImageUrls().clear(); salon.getImageUrls().addAll(change.getProposedImageUrls()); }
            salons.save(salon);
        }
        change.setStatus(approve ? Status.APPROVED : Status.REJECTED);
        change.setReviewedAt(Instant.now()); change.setReviewedBy(admin);
        changes.save(change);
    }

    private Salon owned(UUID owner) {
        return salons.findByOwnerId(owner).orElseThrow(() -> new ResourceNotFoundException("Salon not found for current owner"));
    }
    private static ResourceNotFoundException missing() { return new ResourceNotFoundException("Không tìm thấy yêu cầu hoặc salon."); }
    private static String trim(String value) { return value == null ? "" : value.trim(); }
    private static void requireValidCoordinates(SalonRequest request) {
        if (!request.isCoordinatesValid()) throw new BadRequestException("Vui lòng chọn đủ vĩ độ và kinh độ hợp lệ.");
    }
    private SalonRequest snapshot(Salon s) {
        return new SalonRequest(trim(s.getName()), trim(s.getDescription()), trim(s.getAddress()),
                trim(s.getCity()), trim(s.getDistrict()), trim(s.getPhone()), trim(s.getEmail()),
                s.getLatitude(), s.getLongitude());
    }
    private SalonProfileChangeResponse response(SalonProfileChange c) {
        return new SalonProfileChangeResponse(c.getId(), c.getSalon().getId(), c.getSalon().getName(),
                snapshot(c.getSalon()), c.getProposed(), c.getStatus(), c.getSubmittedAt(), c.getReviewedAt(),
                c.getKind(), c.getSalon().getLogoUrl(), c.getProposedLogoUrl(),
                new ArrayList<>(c.getSalon().getImageUrls()), c.getProposedImageUrls());
    }
}
