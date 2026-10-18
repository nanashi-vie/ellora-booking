package com.bookingnailms;

import com.bookingnailms.dto.subscription.SubscriptionDtos.*;
import com.bookingnailms.entity.*;
import com.bookingnailms.enums.*;
import com.bookingnailms.exception.*;
import com.bookingnailms.repository.*;
import com.bookingnailms.service.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.data.domain.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.locks.ReentrantLock;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SalonSubscriptionTest {
    private final SalonRepository salons = mock(SalonRepository.class);
    private final SalonSubscriptionPlanRepository plans = mock(SalonSubscriptionPlanRepository.class);
    private final SalonSubscriptionRequestRepository requests = mock(SalonSubscriptionRequestRepository.class);
    private final PlatformBillingSettingsRepository billing = mock(PlatformBillingSettingsRepository.class);
    private final UUID owner = UUID.randomUUID(), admin = UUID.randomUUID();
    private static final LocalDateTime NOW = LocalDateTime.of(2026,10,18,10,0,20);
    private final Clock clock = Clock.fixed(NOW.atZone(ZoneId.of("Asia/Ho_Chi_Minh")).toInstant(),ZoneOffset.UTC);
    private final SalonSubscriptionService service = new SalonSubscriptionService(salons,plans,requests,billing,clock);
    private final Salon salon = Salon.builder().id(42L).name("Tiệm kiểm thử").status(SalonStatus.ACTIVE)
            .owner(User.builder().id(owner).build()).build();
    private final SalonSubscriptionPlan standard = SalonSubscriptionPlan.builder().tier(SubscriptionTier.STANDARD).build();
    private final SalonSubscriptionPlan vip = SalonSubscriptionPlan.builder().tier(SubscriptionTier.VIP).build();
    private SalonSubscriptionRequest saved;

    @BeforeEach void setup() {
        var settings = new PlatformBillingSettings(); settings.setQrUrl("https://example.test/bank-qr.png");
        when(billing.findById(1L)).thenReturn(Optional.of(settings));
        when(salons.findByOwnerId(owner)).thenReturn(Optional.of(salon));
        when(salons.findIdByOwnerId(owner)).thenReturn(Optional.of(42L));
        when(salons.findForUpdateById(42L)).thenReturn(Optional.of(salon));
        when(plans.findById(SubscriptionTier.STANDARD)).thenReturn(Optional.of(standard));
        when(plans.findById(SubscriptionTier.VIP)).thenReturn(Optional.of(vip));
        when(plans.findForUpdate(SubscriptionTier.STANDARD)).thenReturn(Optional.of(standard));
        when(plans.findForUpdate(SubscriptionTier.VIP)).thenReturn(Optional.of(vip));
        when(plans.save(any())).thenAnswer(call -> call.getArgument(0));
        when(requests.saveAndFlush(any())).thenAnswer(call -> { saved = call.getArgument(0); if(saved.getId()==null)saved.setId(9L); return saved; });
        when(requests.findSalonIdById(9L)).thenReturn(Optional.of(42L));
        when(requests.findForUpdate(9L)).thenAnswer(call -> Optional.ofNullable(saved));
    }
    private void enabled(SubscriptionTier tier, String price) {
        var plan = tier == SubscriptionTier.VIP ? vip : standard; plan.setEnabled(true); plan.setMonthlyPrice(new BigDecimal(price));
    }
    private void active(SubscriptionTier tier, LocalDateTime start, LocalDateTime expiry) {
        salon.setSubscriptionTier(tier); salon.setSubscriptionStartsAt(start); salon.setSubscriptionExpiresAt(expiry);
    }
    private Request submit(SubscriptionTier tier, String price) { return service.create(owner,new Create(tier,new BigDecimal(price))); }
    private void reported() { service.reportPayment(owner,9L,new PaymentReport(null)); }
    private Request approve() { return service.decide(9L,new Decision(SubscriptionRequestStatus.APPROVED," Đã duyệt ",true,saved.getQuotedPrice()),admin); }

    @Test void catalogHasExactlyTwoUnconfiguredPlansWithoutInventedPrices() {
        var catalog = service.catalog();
        assertEquals(List.of(SubscriptionTier.STANDARD,SubscriptionTier.VIP),catalog.stream().map(Plan::tier).toList());
        assertEquals(List.of("Shop yêu thích","Shop đối tác"),catalog.stream().map(Plan::badgeLabel).toList());
        for (var plan : catalog) { assertNull(plan.monthlyPrice()); assertFalse(plan.enabled()); assertEquals(1,plan.termMonths()); assertEquals("VND",plan.currency()); }
        verify(requests,never()).saveAndFlush(any()); verify(plans,never()).save(any());
    }

    @Test void adminRequiresPositiveEnabledPriceAndCanDisableWithoutRemovingActiveEntitlement() {
        active(SubscriptionTier.VIP,NOW.minusDays(1),NOW.plusDays(20));
        assertThrows(BadRequestException.class,()->service.updatePlan(SubscriptionTier.VIP,new PlanUpdate(BigDecimal.ZERO,true),admin));
        var configured = service.updatePlan(SubscriptionTier.VIP,new PlanUpdate(BigDecimal.ONE,true),admin);
        assertEquals(BigDecimal.ONE,configured.monthlyPrice()); assertTrue(configured.enabled()); assertTrue(configured.registrationAvailable());
        assertEquals(admin,vip.getUpdatedBy()); assertEquals(NOW,vip.getUpdatedAt());
        service.updatePlan(SubscriptionTier.VIP,new PlanUpdate(null,false),admin);
        assertEquals(SubscriptionTier.VIP,service.ownerState(owner).effectiveTier());
        assertThrows(BadRequestException.class,()->service.updatePlan(SubscriptionTier.VIP,new PlanUpdate(null,true),admin));
    }

    @Test void rejectsMissingNegativeFractionalAndOversizedPrices() {
        for (var price : List.of(new BigDecimal("-1"),new BigDecimal("1.5"),new BigDecimal("1000000000000000"))) {
            assertThrows(BadRequestException.class,()->service.updatePlan(SubscriptionTier.STANDARD,new PlanUpdate(price,true),admin));
            assertThrows(BadRequestException.class,()->service.create(owner,new Create(SubscriptionTier.STANDARD,price)));
        }
        assertThrows(BadRequestException.class,()->service.create(owner,new Create(SubscriptionTier.STANDARD,null)));
        assertThrows(BadRequestException.class,()->service.updatePlan(SubscriptionTier.STANDARD,new PlanUpdate(BigDecimal.ZERO,null),admin));
        verify(requests,never()).saveAndFlush(any());
    }

    @Test void unavailableStaleDuplicateAndInactiveRequestsCannotActivateAnything() {
        assertThrows(BadRequestException.class,()->submit(SubscriptionTier.STANDARD,"0"));
        enabled(SubscriptionTier.STANDARD,"100");
        assertThrows(BadRequestException.class,()->submit(SubscriptionTier.STANDARD,"99"));
        when(requests.existsBySalonIdAndStatus(42L,SubscriptionRequestStatus.PENDING)).thenReturn(true);
        assertThrows(BadRequestException.class,()->submit(SubscriptionTier.STANDARD,"100"));
        when(requests.existsBySalonIdAndStatus(42L,SubscriptionRequestStatus.PENDING)).thenReturn(false);
        salon.setStatus(SalonStatus.SUSPENDED);
        assertThrows(BadRequestException.class,()->submit(SubscriptionTier.STANDARD,"100"));
        assertNull(salon.getSubscriptionTier()); verify(requests,never()).saveAndFlush(any());
    }

    @Test void quoteIsCreatedUnderSalonThenCatalogLocksAndSurvivesRepricingAndDisable() {
        enabled(SubscriptionTier.STANDARD,"100");
        var pending = submit(SubscriptionTier.STANDARD,"100");
        assertEquals(SubscriptionRequestStatus.PENDING,pending.status()); assertNull(salon.getSubscriptionTier()); assertNull(pending.startsAt());
        var order = inOrder(salons,requests,plans);
        order.verify(salons).findIdByOwnerId(owner); order.verify(salons).findForUpdateById(42L);
        order.verify(requests).existsBySalonIdAndStatus(42L,SubscriptionRequestStatus.PENDING);
        order.verify(plans).findForUpdate(SubscriptionTier.STANDARD); order.verify(requests).saveAndFlush(any());
        service.updatePlan(SubscriptionTier.STANDARD,new PlanUpdate(new BigDecimal("999"),false),admin);
        reported();
        var approved = approve();
        assertEquals(new BigDecimal("100"),approved.quotedPrice()); assertEquals(NOW,approved.startsAt()); assertEquals(NOW.plusMonths(1),approved.expiresAt());
        assertEquals(SubscriptionTier.STANDARD,salon.effectiveSubscriptionTier(NOW));
    }

    @Test void approvalLocksSalonBeforeReloadingRequestAndReplayCannotExtendOrOverwriteAudit() {
        enabled(SubscriptionTier.VIP,"1"); submit(SubscriptionTier.VIP,"1"); reported(); clearInvocations(salons,requests,plans);
        var result = approve();
        var order = inOrder(requests,salons); order.verify(requests).findSalonIdById(9L); order.verify(salons).findForUpdateById(42L); order.verify(requests).findForUpdate(9L);
        assertEquals("Đã duyệt",result.reviewNote()); assertEquals(admin,saved.getReviewedBy());
        assertEquals(result,service.decide(9L,new Decision(SubscriptionRequestStatus.APPROVED,"khác"),UUID.randomUUID()));
        assertEquals(NOW.plusMonths(1),salon.getSubscriptionExpiresAt()); assertEquals(admin,saved.getReviewedBy());
        verify(salons,times(1)).save(salon); verify(requests,times(1)).saveAndFlush(saved); verifyNoInteractions(plans);
        assertThrows(BadRequestException.class,()->service.decide(9L,new Decision(SubscriptionRequestStatus.REJECTED,"khác"),admin));
    }

    @Test void rejectionRequiresReasonPreservesEntitlementAndReplaysWithoutOverwritingHistory() {
        enabled(SubscriptionTier.VIP,"100"); submit(SubscriptionTier.VIP,"100");
        active(SubscriptionTier.STANDARD,NOW.minusDays(2),NOW.plusDays(20));
        assertThrows(BadRequestException.class,()->service.decide(9L,new Decision(SubscriptionRequestStatus.REJECTED,"  "),admin));
        var rejected = service.decide(9L,new Decision(SubscriptionRequestStatus.REJECTED," Không hợp lệ "),admin);
        assertNull(rejected.startsAt()); assertNull(rejected.expiresAt()); assertEquals("Không hợp lệ",rejected.reviewNote());
        assertEquals(SubscriptionTier.STANDARD,salon.effectiveSubscriptionTier(NOW));
        assertEquals(rejected,service.decide(9L,new Decision(SubscriptionRequestStatus.REJECTED,"Khác"),UUID.randomUUID()));
        assertThrows(BadRequestException.class,this::approve);
    }

    @Test void conflictingActiveTierIsBlockedAtBothSubmissionAndDecisionButExpiredTierCanChange() {
        enabled(SubscriptionTier.VIP,"100");
        active(SubscriptionTier.STANDARD,NOW.minusDays(1),NOW.plusDays(1));
        assertThrows(BadRequestException.class,()->submit(SubscriptionTier.VIP,"100"));
        salon.setSubscriptionExpiresAt(NOW); submit(SubscriptionTier.VIP,"100"); reported();
        salon.setSubscriptionExpiresAt(NOW.plusDays(1)); assertThrows(BadRequestException.class,this::approve);
        salon.setSubscriptionExpiresAt(NOW); approve();
        assertEquals(SubscriptionTier.VIP,salon.getSubscriptionTier()); assertEquals(NOW,salon.getSubscriptionStartsAt());
    }

    @Test void sameTierRenewalExtendsFromExpiryAndAuditsOnlyTheNewMonth() {
        enabled(SubscriptionTier.STANDARD,"100");
        LocalDateTime originalStart = NOW.minusDays(10), oldExpiry = NOW.plusDays(20);
        active(SubscriptionTier.STANDARD,originalStart,oldExpiry); submit(SubscriptionTier.STANDARD,"100"); reported();
        var approved = approve();
        assertEquals(originalStart,salon.getSubscriptionStartsAt()); assertEquals(oldExpiry.plusMonths(1),salon.getSubscriptionExpiresAt());
        assertEquals(oldExpiry,approved.startsAt()); assertEquals(oldExpiry.plusMonths(1),approved.expiresAt());
    }

    @ParameterizedTest @CsvSource({"2024-01-31T10:30,2024-02-29T10:30", "2025-01-31T10:30,2025-02-28T10:30", "2026-12-31T10:30,2027-01-31T10:30"})
    void activationUsesVietnamCalendarMonthAtMonthAndYearBoundaries(String date, String expected) {
        LocalDateTime start = LocalDateTime.parse(date);
        var dateClock = Clock.fixed(start.atZone(ZoneId.of("Asia/Ho_Chi_Minh")).toInstant(),ZoneOffset.UTC);
        var otherService = new SalonSubscriptionService(salons,plans,requests,billing,dateClock);
        enabled(SubscriptionTier.VIP,"1"); otherService.create(owner,new Create(SubscriptionTier.VIP,BigDecimal.ONE));
        otherService.reportPayment(owner,9L,new PaymentReport(null));
        var approved = otherService.decide(9L,new Decision(SubscriptionRequestStatus.APPROVED,null,true,BigDecimal.ONE),admin);
        assertEquals(start,approved.startsAt()); assertEquals(LocalDateTime.parse(expected),approved.expiresAt());
    }

    @Test void exactExpiryFutureStartsMalformedAndSuspendedPeriodsAreNotEffective() {
        active(SubscriptionTier.VIP,NOW,NOW.plusMonths(1)); assertEquals(SubscriptionTier.VIP,service.ownerState(owner).effectiveTier());
        salon.setSubscriptionExpiresAt(NOW); assertNull(service.ownerState(owner).effectiveTier());
        active(SubscriptionTier.VIP,NOW.plusSeconds(1),NOW.plusMonths(1)); assertNull(service.ownerState(owner).effectiveTier());
        active(SubscriptionTier.VIP,NOW,NOW.minusDays(1)); assertNull(service.ownerState(owner).effectiveTier());
        active(SubscriptionTier.VIP,NOW.minusDays(1),NOW.plusMonths(1)); salon.setStatus(SalonStatus.SUSPENDED); assertNull(service.ownerState(owner).badgeLabel());
        assertNotNull(service.ownerState(owner).expiresAt());
    }

    @Test void inactiveSalonCannotBeApprovedAndUnknownOrChangedOwnerCannotRequest() {
        enabled(SubscriptionTier.VIP,"1"); submit(SubscriptionTier.VIP,"1"); reported(); salon.setStatus(SalonStatus.SUSPENDED);
        assertThrows(BadRequestException.class,this::approve); assertEquals(SubscriptionRequestStatus.PENDING,saved.getStatus());
        assertThrows(ResourceNotFoundException.class,()->service.create(UUID.randomUUID(),new Create(SubscriptionTier.VIP,BigDecimal.ONE)));
        salon.getOwner().setId(UUID.randomUUID());
        assertThrows(UnauthorizedException.class,()->submit(SubscriptionTier.VIP,"1"));
    }

    @Test void historiesArePaginatedAndRestrictedToTheResolvedOwnerSalon() {
        var page = PageRequest.of(0,20,Sort.by("id").descending());
        when(requests.findBySalonId(42L,page)).thenReturn(Page.empty(page));
        when(requests.findByStatus(SubscriptionRequestStatus.PENDING,page)).thenReturn(Page.empty(page));
        when(requests.findAll(page)).thenReturn(Page.empty(page));
        service.ownerHistory(owner,page); service.adminHistory(SubscriptionRequestStatus.PENDING,page); service.adminHistory(null,page);
        verify(requests).findBySalonId(42L,page); verify(requests).findByStatus(SubscriptionRequestStatus.PENDING,page); verify(requests).findAll(page);
        assertThrows(ResourceNotFoundException.class,()->service.ownerHistory(UUID.randomUUID(),page));
    }

    @Test void simultaneousSubmissionsSerializeOnTheSalonBeforeCheckingPending() throws Exception {
        enabled(SubscriptionTier.STANDARD,"100"); var lock = new ReentrantLock(); var stored = new java.util.concurrent.atomic.AtomicBoolean();
        when(salons.findForUpdateById(42L)).thenAnswer(call -> { lock.lock(); return Optional.of(salon); });
        when(requests.existsBySalonIdAndStatus(42L,SubscriptionRequestStatus.PENDING)).thenAnswer(call -> stored.get());
        doAnswer(call -> { stored.set(true); var r = (SalonSubscriptionRequest)call.getArgument(0);r.setId(9L);return r; }).when(requests).saveAndFlush(any());
        var pool = Executors.newFixedThreadPool(2); var barrier = new CyclicBarrier(2);
        Callable<Boolean> action = () -> { barrier.await(); try { submit(SubscriptionTier.STANDARD,"100");return true; }
            catch(BadRequestException ex) { return false; } finally { if(lock.isHeldByCurrentThread())lock.unlock(); } };
        try { var first=pool.submit(action);var second=pool.submit(action); assertNotEquals(first.get(5,TimeUnit.SECONDS),second.get(5,TimeUnit.SECONDS)); }
        finally { pool.shutdownNow(); }
        verify(requests,times(1)).saveAndFlush(any());
    }

    @Test void concurrentApprovalsGrantExactlyOneMonthAfterWaitingForTheSalonLock() throws Exception {
        enabled(SubscriptionTier.VIP,"1"); submit(SubscriptionTier.VIP,"1"); reported();
        clearInvocations(requests,salons,plans);
        var lock = new ReentrantLock();
        when(salons.findForUpdateById(42L)).thenAnswer(call -> { lock.lock(); return Optional.of(salon); });
        var pool = Executors.newFixedThreadPool(2); var barrier = new CyclicBarrier(2);
        Callable<Request> action = () -> { barrier.await(); try { return approve(); }
            finally { if(lock.isHeldByCurrentThread())lock.unlock(); } };
        try { var first=pool.submit(action);var second=pool.submit(action); assertEquals(first.get(5,TimeUnit.SECONDS),second.get(5,TimeUnit.SECONDS)); }
        finally { pool.shutdownNow(); }
        assertEquals(NOW.plusMonths(1),salon.getSubscriptionExpiresAt());
        verify(salons,times(1)).save(salon); verify(requests,times(1)).saveAndFlush(saved); verifyNoInteractions(plans);
    }

    @Test void publicDetailExposesOnlyEffectiveBadgeUsingActualNowRatherThanBookingCutoff() {
        var publicService = new SalonService(salons,mock(UserRepository.class),clock);
        when(salons.findById(42L)).thenReturn(Optional.of(salon));
        active(SubscriptionTier.VIP,NOW.minusDays(1),NOW.plusSeconds(1));
        var visible = publicService.getSalonById(42L);
        assertEquals(SubscriptionTier.VIP,visible.getSubscriptionTier()); assertEquals("Shop đối tác",visible.getSubscriptionBadge());
        salon.setSubscriptionExpiresAt(NOW);
        var expired = publicService.getSalonById(42L);
        assertNull(expired.getSubscriptionTier()); assertNull(expired.getSubscriptionBadge());
        assertEquals(SubscriptionTier.VIP,salon.getSubscriptionTier(),"Read expiry without rewriting the stored entitlement");
    }
}
