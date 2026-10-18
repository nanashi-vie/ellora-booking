package com.bookingnailms.service;

import com.bookingnailms.dto.common.PageResponse;
import com.bookingnailms.dto.subscription.SubscriptionDtos.*;
import com.bookingnailms.entity.*;
import com.bookingnailms.enums.*;
import com.bookingnailms.exception.*;
import com.bookingnailms.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;

@Service
public class SalonSubscriptionService {
    private final SalonRepository salons;
    private final SalonSubscriptionPlanRepository plans;
    private final SalonSubscriptionRequestRepository requests;
    private final PlatformBillingSettingsRepository billing;
    private final Clock clock;
    @Autowired
    public SalonSubscriptionService(SalonRepository salons, SalonSubscriptionPlanRepository plans,
            SalonSubscriptionRequestRepository requests, PlatformBillingSettingsRepository billing) {
        this(salons, plans, requests, billing, Clock.systemUTC());
    }
    public SalonSubscriptionService(SalonRepository salons, SalonSubscriptionPlanRepository plans,
            SalonSubscriptionRequestRepository requests, PlatformBillingSettingsRepository billing, Clock clock) {
        this.salons = salons; this.plans = plans; this.requests = requests; this.billing = billing; this.clock = clock;
    }
    private LocalDateTime now() { return LocalDateTime.ofInstant(clock.instant(), ZoneId.of("Asia/Ho_Chi_Minh")); }

    @Transactional(readOnly = true)
    public List<Plan> catalog() {
        boolean qrConfigured = configuredQr().isPresent();
        return Arrays.stream(SubscriptionTier.values()).map(tier -> plan(plans.findById(tier)
                .orElseThrow(() -> new ResourceNotFoundException("Chưa khởi tạo danh mục gói salon.")),qrConfigured)).toList();
    }

    @Transactional @PreAuthorize("hasRole('ADMIN')")
    public Plan updatePlan(SubscriptionTier tier, PlanUpdate body, UUID admin) {
        if (tier == null || body.enabled() == null) throw new BadRequestException("Chọn gói và trạng thái hợp lệ.");
        validatePrice(body.monthlyPrice(), body.enabled());
        var saved = plans.findForUpdate(tier).orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy gói salon."));
        saved.setMonthlyPrice(body.monthlyPrice()); saved.setEnabled(body.enabled()); saved.setUpdatedAt(now()); saved.setUpdatedBy(admin);
        return plan(plans.save(saved));
    }

    @Transactional(readOnly = true)
    public State ownerState(UUID owner) {
        var salon = owned(owner);
        var effective = salon.effectiveSubscriptionTier(now());
        var pending = requests.findFirstBySalonIdAndStatusOrderByIdDesc(salon.getId(), SubscriptionRequestStatus.PENDING);
        return new State(salon.getId(), effective, effective == null ? null : effective.badgeLabel(),
                salon.getSubscriptionStartsAt(), salon.getSubscriptionExpiresAt(), pending.map(this::request).orElse(null));
    }

    @Transactional(readOnly = true)
    public PageResponse<Request> ownerHistory(UUID owner, Pageable pageable) {
        return PageResponse.of(requests.findBySalonId(owned(owner).getId(), pageable).map(this::request));
    }

    @Transactional
    public Request create(UUID owner, Create body) {
        if (body.tier() == null) throw new BadRequestException("Chọn gói hợp lệ.");
        validatePrice(body.expectedPrice(), true);
        // Resolve only the ID before locking: do not reuse a stale salon entity after waiting for another request.
        Long id = salons.findIdByOwnerId(owner).orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy tiệm của bạn."));
        var salon = lockSalon(id);
        if (!salon.getOwner().getId().equals(owner)) throw new UnauthorizedException("Tiệm không thuộc tài khoản của bạn.");
        requireActive(salon);
        if (requests.existsBySalonIdAndStatus(id, SubscriptionRequestStatus.PENDING)) {
            throw new BadRequestException("Tiệm đã có yêu cầu chờ duyệt. Vui lòng chờ Admin xử lý.");
        }
        var now = now();
        requireNoConflictingTier(salon, body.tier(), now);
        var catalog = plans.findForUpdate(body.tier()).orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy gói salon."));
        if (!catalog.isEnabled() || catalog.getMonthlyPrice() == null || catalog.getMonthlyPrice().signum() <= 0) throw new BadRequestException("Gói này hiện chưa mở đăng ký với giá chuyển khoản hợp lệ.");
        if (catalog.getMonthlyPrice().compareTo(body.expectedPrice()) != 0) {
            throw new BadRequestException("Giá gói đã thay đổi. Vui lòng tải lại và xác nhận giá mới.");
        }
        String paymentQrUrl = paymentQr();
        return request(requests.saveAndFlush(SalonSubscriptionRequest.builder().salon(salon).tier(body.tier())
                .quotedPrice(catalog.getMonthlyPrice()).status(SubscriptionRequestStatus.PENDING).createdAt(now).paymentQrUrl(paymentQrUrl).build()));
    }

    @Transactional
    public Request preparePayment(UUID owner, Long id) {
        var saved = pendingOwned(owner,id);
        if (saved.getPaymentQrUrl() != null && !saved.getPaymentQrUrl().isBlank()) return request(saved);
        saved.setPaymentQrUrl(paymentQr());
        return request(requests.saveAndFlush(saved));
    }

    @Transactional
    public Request reportPayment(UUID owner, Long id, PaymentReport body) {
        if (body.reference() != null && body.reference().length() > 100) throw new BadRequestException("Mã giao dịch tối đa 100 ký tự.");
        var saved = pendingOwned(owner,id);
        requirePaymentInstructions(saved);
        if (saved.getPaymentReportedAt() != null) return request(saved);
        saved.setPaymentReportedAt(now());
        saved.setPaymentReference(body.reference() == null ? null : body.reference().strip());
        return request(requests.saveAndFlush(saved));
    }

    private SalonSubscriptionRequest pendingOwned(UUID owner, Long id) {
        Long ownerSalonId = salons.findIdByOwnerId(owner).orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy tiệm của bạn."));
        Long salonId = requests.findSalonIdById(id).orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy yêu cầu."));
        if (!ownerSalonId.equals(salonId)) throw new UnauthorizedException("Yêu cầu không thuộc tiệm của bạn.");
        var salon = lockSalon(salonId);
        if (!salon.getOwner().getId().equals(owner)) throw new UnauthorizedException("Tiệm không thuộc tài khoản của bạn.");
        var saved = requests.findForUpdate(id).orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy yêu cầu."));
        if (!saved.getSalon().getId().equals(salonId)) throw new UnauthorizedException("Yêu cầu không thuộc tiệm của bạn.");
        if (saved.getStatus() != SubscriptionRequestStatus.PENDING) throw new BadRequestException("Yêu cầu đã xử lý, không thể báo chuyển khoản.");
        validatePrice(saved.getQuotedPrice(),true);
        return saved;
    }

    @Transactional(readOnly = true) @PreAuthorize("hasRole('ADMIN')")
    public PageResponse<Request> adminHistory(SubscriptionRequestStatus status, Pageable pageable) {
        return PageResponse.of((status == null ? requests.findAll(pageable) : requests.findByStatus(status, pageable)).map(this::request));
    }

    @Transactional @PreAuthorize("hasRole('ADMIN')")
    public Request decide(Long id, Decision body, UUID admin) {
        if (body.status() == null || body.status() == SubscriptionRequestStatus.PENDING
                || body.note() != null && body.note().length() > 1000) throw new BadRequestException("Kết quả hoặc ghi chú không hợp lệ.");
        String note = body.note() == null ? null : body.note().strip();
        if (body.status() == SubscriptionRequestStatus.REJECTED && (note == null || note.isBlank())) {
            throw new BadRequestException("Vui lòng nhập lý do từ chối.");
        }
        Long salonId = requests.findSalonIdById(id).orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy yêu cầu."));
        var salon = lockSalon(salonId);
        var saved = requests.findForUpdate(id).orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy yêu cầu."));
        if (!saved.getSalon().getId().equals(salonId)) throw new BadRequestException("Yêu cầu không còn thuộc tiệm này.");
        if (saved.getStatus() != SubscriptionRequestStatus.PENDING) {
            if (saved.getStatus() == body.status()) return request(saved);
            throw new BadRequestException("Yêu cầu đã được xử lý với kết quả khác. Vui lòng tải lại.");
        }
        var now = now();
        if (body.status() == SubscriptionRequestStatus.APPROVED) {
            requirePaymentInstructions(saved);
            if (saved.getPaymentReportedAt() == null) throw new BadRequestException("Tiệm chưa báo đã chuyển khoản. Chưa thể xác nhận nhận tiền và kích hoạt.");
            validatePrice(body.expectedAmount(),true);
            if (!Boolean.TRUE.equals(body.paymentReceived()) || body.expectedAmount().compareTo(saved.getQuotedPrice()) != 0) {
                throw new BadRequestException("Cần xác nhận đã nhận đủ tiền và đúng số tiền đã báo cho tiệm.");
            }
            requireActive(salon); requireNoConflictingTier(salon, saved.getTier(), now);
            boolean renewal = salon.effectiveSubscriptionTier(now) == saved.getTier();
            LocalDateTime grantStart = renewal ? salon.getSubscriptionExpiresAt() : now;
            LocalDateTime grantEnd = grantStart.plusMonths(1);
            if (!renewal) salon.setSubscriptionStartsAt(now);
            salon.setSubscriptionTier(saved.getTier()); salon.setSubscriptionExpiresAt(grantEnd);
            saved.setStartsAt(grantStart); saved.setExpiresAt(grantEnd);
            saved.setPaymentConfirmedAt(now); saved.setPaymentConfirmedBy(admin); saved.setReceivedAmount(saved.getQuotedPrice());
            salons.save(salon);
        }
        saved.setStatus(body.status()); saved.setReviewedAt(now); saved.setReviewedBy(admin); saved.setReviewNote(note);
        return request(requests.saveAndFlush(saved));
    }

    private Salon owned(UUID owner) { return salons.findByOwnerId(owner).orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy tiệm của bạn.")); }
    private Salon lockSalon(Long id) { return salons.findForUpdateById(id).orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy tiệm.")); }
    private void requireActive(Salon salon) {
        if (salon.getStatus() != SalonStatus.ACTIVE) throw new BadRequestException("Chỉ tiệm đang hoạt động mới có thể đăng ký hoặc kích hoạt gói.");
    }
    private void requireNoConflictingTier(Salon salon, SubscriptionTier tier, LocalDateTime now) {
        var effective = salon.effectiveSubscriptionTier(now);
        if (effective != null && effective != tier) throw new BadRequestException("Tiệm đang có gói khác còn hạn. Vui lòng chờ hết hạn để đổi gói.");
    }
    private void validatePrice(BigDecimal price, boolean required) {
        if (price == null && !required) return;
        if (price == null || price.signum() < 0 || required && price.signum() == 0 || price.scale() > 0 || price.precision() - price.scale() > 15) {
            throw new BadRequestException("Giá mở đăng ký hoặc số tiền xác nhận cần là số nguyên VNĐ lớn hơn 0, tối đa 15 chữ số.");
        }
    }
    private String paymentQr() {
        return configuredQr()
                .orElseThrow(() -> new BadRequestException("Admin cần cấu hình mã QR chuyển khoản tại mục Phí nền tảng trước khi mở đăng ký gói."));
    }
    private Optional<String> configuredQr() {
        return billing.findById(1L).map(PlatformBillingSettings::getQrUrl).filter(qr -> !qr.isBlank());
    }
    private void requirePaymentInstructions(SalonSubscriptionRequest request) {
        validatePrice(request.getQuotedPrice(),true);
        if (request.getPaymentQrUrl() == null || request.getPaymentQrUrl().isBlank()) {
            throw new BadRequestException("Yêu cầu chưa có mã QR chuyển khoản. Vui lòng liên hệ Admin để cấp lại hướng dẫn thanh toán.");
        }
    }
    private Plan plan(SalonSubscriptionPlan p) {
        return plan(p,configuredQr().isPresent());
    }
    private Plan plan(SalonSubscriptionPlan p, boolean qrConfigured) {
        return new Plan(p.getTier(), p.getTier().displayName(), p.getTier().badgeLabel(), p.getMonthlyPrice(), "VND",
                p.isEnabled(), 1, p.isEnabled() && p.getMonthlyPrice() != null && p.getMonthlyPrice().signum() > 0 && qrConfigured);
    }
    private Request request(SalonSubscriptionRequest r) {
        return new Request(r.getId(), r.getSalon().getId(), r.getSalon().getName(), r.getTier(), r.getQuotedPrice(),
                r.getStatus(), r.getCreatedAt(), r.getReviewedAt(), r.getReviewNote(), r.getStartsAt(), r.getExpiresAt(),
                r.getPaymentQrUrl(), "ELLORA GOI" + r.getId(), r.getPaymentReportedAt(), r.getPaymentReference(),
                r.getPaymentConfirmedAt(), r.getReceivedAmount());
    }
}
