package com.bookingnailms;

import com.bookingnailms.dto.subscription.SubscriptionDtos.*;
import com.bookingnailms.entity.*;
import com.bookingnailms.enums.*;
import com.bookingnailms.exception.*;
import com.bookingnailms.repository.*;
import com.bookingnailms.service.SalonSubscriptionService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.locks.ReentrantLock;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SubscriptionBankTransferTest {
    private final SalonRepository salons = mock(SalonRepository.class);
    private final SalonSubscriptionPlanRepository plans = mock(SalonSubscriptionPlanRepository.class);
    private final SalonSubscriptionRequestRepository requests = mock(SalonSubscriptionRequestRepository.class);
    private final PlatformBillingSettingsRepository billing = mock(PlatformBillingSettingsRepository.class);
    private final UUID owner = UUID.randomUUID(), admin = UUID.randomUUID();
    private static final LocalDateTime NOW = LocalDateTime.of(2026,10,18,10,0,20);
    private final Clock clock = Clock.fixed(NOW.atZone(ZoneId.of("Asia/Ho_Chi_Minh")).toInstant(),ZoneOffset.UTC);
    private final SalonSubscriptionService service = new SalonSubscriptionService(salons,plans,requests,billing,clock);
    private final Salon salon = Salon.builder().id(42L).name("Tiệm thử").status(SalonStatus.ACTIVE).owner(User.builder().id(owner).build()).build();
    private final SalonSubscriptionPlan catalog = SalonSubscriptionPlan.builder().tier(SubscriptionTier.VIP).enabled(true).monthlyPrice(new BigDecimal("100")).build();
    private final PlatformBillingSettings settings = new PlatformBillingSettings();
    private SalonSubscriptionRequest saved;

    @BeforeEach void setup() {
        settings.setQrUrl("https://example.test/original-qr.png"); when(billing.findById(1L)).thenReturn(Optional.of(settings));
        when(salons.findIdByOwnerId(owner)).thenReturn(Optional.of(42L)); when(salons.findForUpdateById(42L)).thenReturn(Optional.of(salon));
        when(plans.findForUpdate(SubscriptionTier.VIP)).thenReturn(Optional.of(catalog));
        when(plans.save(any())).thenAnswer(call -> call.getArgument(0));
        when(plans.findById(SubscriptionTier.VIP)).thenReturn(Optional.of(catalog));
        when(plans.findById(SubscriptionTier.STANDARD)).thenReturn(Optional.of(SalonSubscriptionPlan.builder().tier(SubscriptionTier.STANDARD).build()));
        when(requests.findSalonIdById(9L)).thenReturn(Optional.of(42L));
        when(requests.findForUpdate(9L)).thenAnswer(call -> Optional.ofNullable(saved));
        when(requests.saveAndFlush(any())).thenAnswer(call -> { saved=call.getArgument(0);if(saved.getId()==null)saved.setId(9L);return saved; });
    }
    private Request create() { return service.create(owner,new Create(SubscriptionTier.VIP,new BigDecimal("100"))); }
    private Request report(String ref) { return service.reportPayment(owner,9L,new PaymentReport(ref)); }
    private Request approve() { return service.decide(9L,new Decision(SubscriptionRequestStatus.APPROVED,null,true,new BigDecimal("100")),admin); }

    @Test void creationSnapshotsInstructionsWithoutClaimingPaymentOrActivating() {
        var result=create(); assertEquals("https://example.test/original-qr.png",result.paymentQrUrl()); assertEquals("ELLORA GOI9",result.transferContent());
        assertNull(result.paymentReportedAt()); assertNull(result.paymentConfirmedAt()); assertNull(result.receivedAmount());
        assertNull(salon.getSubscriptionTier()); assertEquals(SubscriptionRequestStatus.PENDING,result.status());
        settings.setQrUrl("https://example.test/new-qr.png");
        assertEquals(result.paymentQrUrl(),service.preparePayment(owner,9L).paymentQrUrl());
    }

    @Test void qrReadinessKeepsRawEnabledAndRejectsPurchasesUntilConfigured() {
        settings.setQrUrl("  ");
        var plan=service.catalog().get(1); assertTrue(plan.enabled()); assertFalse(plan.registrationAvailable());
        assertThrows(BadRequestException.class,this::create); verify(requests,never()).saveAndFlush(any());
        assertTrue(service.updatePlan(SubscriptionTier.VIP,new PlanUpdate(new BigDecimal("100"),true),admin).enabled());
        settings.setQrUrl("https://example.test/ready.png"); assertTrue(service.catalog().get(1).registrationAvailable());
        catalog.setMonthlyPrice(BigDecimal.ZERO); assertTrue(service.catalog().get(1).enabled()); assertFalse(service.catalog().get(1).registrationAvailable());
        assertThrows(BadRequestException.class,()->service.create(owner,new Create(SubscriptionTier.VIP,BigDecimal.ZERO)));
    }

    @Test void legacyPositivePendingCanPrepareOnceWithoutCurrentPriceOrEnabledCatalog() {
        create(); saved.setPaymentQrUrl(null); catalog.setEnabled(false);catalog.setMonthlyPrice(new BigDecimal("999"));
        clearInvocations(plans,billing,requests,salons);
        var prepared=service.preparePayment(owner,9L);
        assertEquals("https://example.test/original-qr.png",prepared.paymentQrUrl()); assertEquals(new BigDecimal("100"),prepared.quotedPrice());
        assertNull(prepared.paymentReportedAt()); assertNull(prepared.paymentConfirmedAt()); assertNull(salon.getSubscriptionTier());
        var ordered=inOrder(salons,requests); ordered.verify(salons).findIdByOwnerId(owner); ordered.verify(requests).findSalonIdById(9L);
        ordered.verify(salons).findForUpdateById(42L); ordered.verify(requests).findForUpdate(9L);
        settings.setQrUrl("https://example.test/other.png"); assertEquals(prepared,service.preparePayment(owner,9L));
        assertNotNull(report("LEGACY-TRANSFER").paymentReportedAt());
        verify(requests,times(2)).saveAndFlush(saved); verifyNoInteractions(plans);
    }

    @Test void absentQrAndLegacyZeroPendingCannotBePreparedReportedOrApproved() {
        create(); saved.setPaymentQrUrl(null); settings.setQrUrl(null);
        assertThrows(BadRequestException.class,()->service.preparePayment(owner,9L));
        assertThrows(BadRequestException.class,()->report(null)); assertThrows(BadRequestException.class,this::approve);
        saved.setQuotedPrice(BigDecimal.ZERO); settings.setQrUrl("https://example.test/qr.png");
        assertThrows(BadRequestException.class,()->service.preparePayment(owner,9L));
        assertThrows(BadRequestException.class,()->report(null)); assertThrows(BadRequestException.class,this::approve);
        assertEquals(SubscriptionRequestStatus.PENDING,saved.getStatus()); assertNull(salon.getSubscriptionTier());
        assertEquals(SubscriptionRequestStatus.REJECTED,service.decide(9L,new Decision(SubscriptionRequestStatus.REJECTED,"Tạo lại báo giá dương"),admin).status());
    }

    @Test void firstOwnerReportIsImmutableAndDoesNotConfirmMoneyOrEntitlement() {
        create(); var first=report("  BANK-123  ");
        assertEquals(NOW,first.paymentReportedAt()); assertEquals("BANK-123",first.paymentReference());
        assertEquals(first,report("OTHER")); assertEquals(SubscriptionRequestStatus.PENDING,saved.getStatus());
        assertNull(saved.getPaymentConfirmedBy());assertNull(first.receivedAmount());assertNull(salon.getSubscriptionTier());
        assertThrows(BadRequestException.class,()->report("x".repeat(101)));
    }

    @Test void ownershipChecksPreventPreparingOrReportingAnotherSalonsRequest() {
        create(); UUID other=UUID.randomUUID(); when(salons.findIdByOwnerId(other)).thenReturn(Optional.of(99L));
        clearInvocations(salons,requests);
        assertThrows(UnauthorizedException.class,()->service.preparePayment(other,9L));
        assertThrows(UnauthorizedException.class,()->service.reportPayment(other,9L,new PaymentReport(null)));
        verify(salons,never()).findForUpdateById(any()); verify(requests,never()).findForUpdate(any());
        salon.getOwner().setId(other);
        assertThrows(UnauthorizedException.class,()->service.preparePayment(owner,9L));
    }

    @Test void everyReceiptGuardIsRequiredBeforeGrantingThePeriod() {
        create(); assertThrows(BadRequestException.class,this::approve); report("TX");
        for (Decision body : List.of(new Decision(SubscriptionRequestStatus.APPROVED,null),
                new Decision(SubscriptionRequestStatus.APPROVED,null,false,new BigDecimal("100")),
                new Decision(SubscriptionRequestStatus.APPROVED,null,true,null),
                new Decision(SubscriptionRequestStatus.APPROVED,null,true,new BigDecimal("99")),
                new Decision(SubscriptionRequestStatus.APPROVED,null,true,new BigDecimal("100.5")),
                new Decision(SubscriptionRequestStatus.APPROVED,null,true,BigDecimal.ZERO))) {
            assertThrows(BadRequestException.class,()->service.decide(9L,body,admin));
            assertEquals(SubscriptionRequestStatus.PENDING,saved.getStatus()); assertNull(salon.getSubscriptionTier());
        }
        var approved=approve();assertEquals(NOW,approved.paymentConfirmedAt());assertEquals(new BigDecimal("100"),approved.receivedAmount());
        assertEquals(admin,saved.getPaymentConfirmedBy()); assertEquals(NOW.plusMonths(1),salon.getSubscriptionExpiresAt());
    }

    @Test void approvalUsesStoredInstructionsAndQuoteAfterQrAndPriceChanges() {
        var original=create();report(null);catalog.setMonthlyPrice(new BigDecimal("999"));catalog.setEnabled(false);settings.setQrUrl(null);
        clearInvocations(plans,billing); var result=approve();
        assertEquals(original.paymentQrUrl(),result.paymentQrUrl());assertEquals(original.quotedPrice(),result.receivedAmount());
        verifyNoInteractions(plans,billing);
    }

    @Test void rejectionBeforeOrAfterOwnerReportDoesNotRecordReceivedMoney() {
        create();report(null);
        var result=service.decide(9L,new Decision(SubscriptionRequestStatus.REJECTED,"Chưa thấy giao dịch"),admin);
        assertNotNull(result.paymentReportedAt());assertNull(result.paymentConfirmedAt());assertNull(result.receivedAmount());assertNull(salon.getSubscriptionTier());
        assertThrows(BadRequestException.class,()->report(null));assertThrows(BadRequestException.class,()->service.preparePayment(owner,9L));
    }

    @Test void legacyApprovalReplayDoesNotFabricateBankAuditOrExtendDates() throws Exception {
        create(); saved.setStatus(SubscriptionRequestStatus.APPROVED);saved.setStartsAt(NOW.minusDays(2));saved.setExpiresAt(NOW.plusDays(28));
        saved.setPaymentQrUrl(null); saved.setReviewedAt(NOW.minusDays(2));saved.setReviewedBy(admin);
        salon.setSubscriptionTier(SubscriptionTier.VIP);salon.setSubscriptionStartsAt(saved.getStartsAt());salon.setSubscriptionExpiresAt(saved.getExpiresAt());
        clearInvocations(requests,salons);
        var historical=service.decide(9L,new Decision(SubscriptionRequestStatus.APPROVED,null),UUID.randomUUID());
        assertNull(historical.paymentConfirmedAt());assertNull(historical.receivedAmount());assertNull(saved.getPaymentConfirmedBy());
        assertEquals(NOW.plusDays(28),salon.getSubscriptionExpiresAt());verify(requests,never()).saveAndFlush(any());verify(salons,never()).save(any());
        String json=new ObjectMapper().findAndRegisterModules().writeValueAsString(historical);
        assertFalse(json.contains("paymentConfirmedBy"));assertFalse(json.contains("reviewedBy"));
    }

    @Test void concurrentReportAndDecisionCannotActivateWithoutExplicitReceivedMoney() throws Exception {
        create(); var lock=new ReentrantLock();when(salons.findForUpdateById(42L)).thenAnswer(call->{lock.lock();return Optional.of(salon);});
        var pool=Executors.newFixedThreadPool(2);var barrier=new CyclicBarrier(2);
        Callable<Boolean> report=()->{barrier.await();try{report("TX");return true;}finally{if(lock.isHeldByCurrentThread())lock.unlock();}};
        Callable<Boolean> withoutReceipt=()->{barrier.await();try{service.decide(9L,new Decision(SubscriptionRequestStatus.APPROVED,null,false,new BigDecimal("100")),admin);return true;}
            catch(BadRequestException ex){return false;}finally{if(lock.isHeldByCurrentThread())lock.unlock();}};
        try{var first=pool.submit(report);var second=pool.submit(withoutReceipt);assertTrue(first.get(5,TimeUnit.SECONDS));assertFalse(second.get(5,TimeUnit.SECONDS));}
        finally{pool.shutdownNow();}
        assertEquals(SubscriptionRequestStatus.PENDING,saved.getStatus());assertNull(salon.getSubscriptionTier());assertNull(saved.getPaymentConfirmedAt());
    }
}
