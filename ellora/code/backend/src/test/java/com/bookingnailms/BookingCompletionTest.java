package com.bookingnailms;

import com.bookingnailms.dto.booking.*;
import com.bookingnailms.entity.*;
import com.bookingnailms.enums.*;
import com.bookingnailms.exception.*;
import com.bookingnailms.repository.*;
import com.bookingnailms.service.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.data.domain.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BookingCompletionTest {
    private final BookingRepository bookings = mock(BookingRepository.class);
    private final SalonRepository salons = mock(SalonRepository.class);
    private final BookingCompletionDisputeRepository disputes = mock(BookingCompletionDisputeRepository.class);
    private final BookingEmailService emails = mock(BookingEmailService.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-10-17T03:00:00Z"), ZoneOffset.UTC);
    private final BookingService bookingService = new BookingService(bookings, salons, mock(NailServiceRepository.class),
            mock(EmployeeRepository.class), mock(UserRepository.class), emails, null, clock);
    private final BookingCompletionService service = new BookingCompletionService(bookings, salons, disputes, bookingService, clock);
    private final UUID adminId = UUID.randomUUID();
    private final User customer = User.builder().id(UUID.randomUUID()).fullName("Linh").phone("0900000000").email("customer@example.com").build();
    private final User owner = User.builder().id(UUID.randomUUID()).fullName("Chủ tiệm").phone("0902222222").email("owner@example.com").build();
    private final Salon salon = Salon.builder().id(1L).name("Tiệm Ellora").owner(owner).phone("0903333333").email("salon@example.com").address("12 Đường A").build();
    private final Employee employee = Employee.builder().id(3L).fullName("Thợ nail").salon(salon).build();
    private final Booking booking = Booking.builder().id(7L).customer(customer).customerPhone("0901234567").salon(salon)
            .service(NailService.builder().id(2L).name("Sơn gel").price(BigDecimal.valueOf(150000)).build()).employee(employee)
            .scheduledAt(LocalDateTime.of(2026, 10, 16, 10, 0)).durationMinutes(60).servicePriceSnapshot(BigDecimal.valueOf(120000))
            .status(BookingStatus.COMPLETED).completedAt(LocalDateTime.of(2026, 10, 16, 11, 0))
            .completionVersion(2).completionConfirmation(CompletionConfirmation.PENDING).build();
    private final List<BookingCompletionDispute> history = new ArrayList<>();

    @BeforeEach void setup() {
        when(bookings.findForUpdateById(7L)).thenReturn(Optional.of(booking));
        when(bookings.save(any())).thenAnswer(call -> call.getArgument(0));
        when(salons.findForUpdateById(1L)).thenReturn(Optional.of(salon));
        when(disputes.save(any())).thenAnswer(call -> {
            BookingCompletionDispute value = call.getArgument(0);
            if (value.getId() == null) { value.setId((long) history.size() + 1); history.add(value); }
            return value;
        });
    }

    private BookingResponse respond(boolean completed, String reason) {
        return service.respond(7L, new BookingCompletionResponseRequest(completed, reason, booking.getCompletionVersion()), customer.getId());
    }
    private BookingCompletionDispute report() {
        respond(false, " Dịch vụ chưa làm xong ");
        var dispute = history.get(history.size() - 1);
        var target = mock(BookingCompletionDisputeRepository.ResolutionTarget.class);
        when(target.getBookingId()).thenReturn(7L); when(target.getSalonId()).thenReturn(1L);
        when(disputes.findTargetById(dispute.getId())).thenReturn(Optional.of(target));
        when(disputes.findForUpdateById(dispute.getId())).thenReturn(Optional.of(dispute));
        when(disputes.findById(dispute.getId())).thenReturn(Optional.of(dispute));
        return dispute;
    }
    private BookingCompletionResolutionRequest resolveRequest(BookingCompletionDisputeStatus outcome) {
        return new BookingCompletionResolutionRequest(outcome, " Đã liên hệ hai bên ");
    }

    @Test void confirmsOnlyThisCompletionAndMatchingRetryDoesNotWriteAgain() {
        var first = respond(true, null);
        assertEquals(CompletionConfirmation.CONFIRMED, first.getCompletionConfirmation());
        assertEquals(LocalDateTime.of(2026, 10, 17, 10, 0), first.getCompletionRespondedAt());
        var completedAt = booking.getCompletedAt();
        respond(true, "Nội dung gửi lại không đổi quyết định");
        assertEquals(completedAt, booking.getCompletedAt());
        assertThrows(BadRequestException.class, () -> respond(false, "Đổi ý"));
        verify(bookings, times(1)).save(booking); verifyNoInteractions(disputes, emails);
    }

    @Test void negativeResponseCreatesOneCaseKeepsRevenueStatusAndPreservesOriginalReasonOnRetry() {
        var response = respond(false, " Chưa làm xong ");
        respond(false, "Lý do khác khi gửi lại");
        assertEquals(BookingStatus.COMPLETED, booking.getStatus());
        assertEquals(CompletionConfirmation.DISPUTED, response.getCompletionConfirmation());
        assertEquals("Chưa làm xong", booking.getCompletionCustomerNote());
        assertEquals(1, history.size()); assertEquals(2, history.get(0).getCompletionVersion());
        assertEquals("Chưa làm xong", history.get(0).getReason());
        assertEquals(BookingCompletionDisputeStatus.OPEN, history.get(0).getStatus());
        assertEquals(LocalDateTime.of(2026, 10, 17, 10, 0), history.get(0).getCreatedAt());
        assertThrows(BadRequestException.class, () -> respond(true, null));
        verify(disputes, times(1)).save(any()); verify(bookings, times(1)).save(booking); verifyNoInteractions(emails);
    }

    @Test void blankReasonAndStaleVersionCannotCreateCase() {
        assertThrows(BadRequestException.class, () -> respond(false, "  "));
        for (long version : List.of(0L, 1L, 3L)) {
            assertThrows(BadRequestException.class, () -> service.respond(7L, new BookingCompletionResponseRequest(false, "Bận", version), customer.getId()));
        }
        verifyNoInteractions(disputes); verify(bookings, never()).save(any());
        assertEquals(CompletionConfirmation.PENDING, booking.getCompletionConfirmation());
    }

    @Test void anotherCustomerOrWalkInCannotRespond() {
        assertThrows(UnauthorizedException.class, () -> service.respond(7L, new BookingCompletionResponseRequest(true, null, 2L), UUID.randomUUID()));
        booking.setCustomer(null);
        assertThrows(UnauthorizedException.class, () -> respond(true, null));
        verify(bookings, never()).save(any()); verifyNoInteractions(disputes);
    }

    @ParameterizedTest @EnumSource(value = BookingStatus.class, mode = EnumSource.Mode.EXCLUDE, names = "COMPLETED")
    void cannotRespondToUnfinishedOrCancelledLifecycle(BookingStatus status) {
        booking.setStatus(status);
        assertThrows(BadRequestException.class, () -> respond(true, null));
        verify(bookings, never()).save(any());
    }

    @Test void legacyResponseFreezesOriginalRevenueMonthBeforeUpdatedAtChanges() {
        booking.setCompletionConfirmation(null); booking.setCompletionVersion(0); booking.setCompletedAt(null);
        var oldBucket = LocalDateTime.of(2026, 9, 30, 23, 0); booking.setUpdatedAt(oldBucket);
        respond(false, "Chưa hoàn thành");
        assertEquals(oldBucket, booking.getCompletedAt()); assertTrue(booking.isRevenueEstimated());
        assertEquals(BookingStatus.COMPLETED, booking.getStatus());
    }

    @Test void legacyWithoutUpdatedAtUsesScheduledTimeAndExistingReviewIsConfirmed() {
        booking.setCompletionConfirmation(null); booking.setCompletionVersion(0); booking.setCompletedAt(null);
        respond(true, null);
        assertEquals(booking.getScheduledAt(), booking.getCompletedAt());
        booking.setCompletionConfirmation(null); booking.setReview(Review.builder().rating(5).build());
        assertEquals(CompletionConfirmation.CONFIRMED, booking.effectiveCompletionConfirmation());
        assertThrows(BadRequestException.class, () -> respond(false, "Đổi ý"));
    }

    @Test void adminUpholdRetainsRevenueDateStoresConclusionIdentityAndContactsAndRetriesIdempotently() {
        var dispute = report(); var completedAt = booking.getCompletedAt();
        var response = service.resolve(dispute.getId(), resolveRequest(BookingCompletionDisputeStatus.UPHELD), adminId);
        assertEquals(BookingStatus.COMPLETED, booking.getStatus()); assertEquals(completedAt, booking.getCompletedAt());
        assertEquals(CompletionConfirmation.ADMIN_CONFIRMED, booking.getCompletionConfirmation());
        assertEquals("Đã liên hệ hai bên", booking.getCompletionAdminNote()); assertEquals(adminId, response.getResolvedBy());
        assertEquals(LocalDateTime.of(2026, 10, 17, 10, 0), response.getResolvedAt());
        assertEquals("0901234567", response.getCustomerPhone()); assertEquals("customer@example.com", response.getCustomerEmail());
        assertEquals("0902222222", response.getOwnerPhone()); assertEquals("owner@example.com", response.getOwnerEmail());
        assertEquals("0903333333", response.getSalonPhone()); assertEquals("salon@example.com", response.getSalonEmail());
        assertEquals("12 Đường A", response.getSalonAddress()); assertEquals(BigDecimal.valueOf(120000), response.getServicePrice());
        assertEquals("Thợ nail", response.getEmployeeName());
        service.resolve(dispute.getId(), resolveRequest(BookingCompletionDisputeStatus.UPHELD), UUID.randomUUID());
        assertEquals(adminId, dispute.getResolvedBy());
        assertThrows(BadRequestException.class, () -> service.resolve(dispute.getId(), resolveRequest(BookingCompletionDisputeStatus.REOPENED), adminId));
        assertThrows(BadRequestException.class, () -> service.resolve(dispute.getId(), new BookingCompletionResolutionRequest(BookingCompletionDisputeStatus.UPHELD, "Kết luận mới"), adminId));
        verify(bookings, times(2)).save(booking); verify(disputes, times(2)).save(any()); verifyNoInteractions(emails);
    }

    @Test void reopenPastBookingDoesNotReserveNewSlotAndRecompletionKeepsHistoryWithNewVersion() {
        var dispute = report(); var originalDate = booking.getScheduledAt();
        service.resolve(dispute.getId(), resolveRequest(BookingCompletionDisputeStatus.REOPENED), adminId);
        assertEquals(BookingStatus.IN_PROGRESS, booking.getStatus()); assertNull(booking.getCompletedAt());
        assertEquals(CompletionConfirmation.REOPENED, booking.getCompletionConfirmation());
        assertEquals(originalDate, booking.getScheduledAt()); assertEquals(employee, booking.getEmployee());
        verify(bookings, never()).findOverlapping(any(), any(), any());
        var complete = new BookingStatusUpdateRequest(); complete.setStatus(BookingStatus.COMPLETED);
        var response = bookingService.updateBookingStatus(7L, complete, owner.getId());
        assertEquals(3, response.getCompletionVersion()); assertEquals(CompletionConfirmation.PENDING, response.getCompletionConfirmation());
        assertNull(response.getCompletionRespondedAt()); assertNull(response.getCompletionCustomerNote());
        assertNull(response.getCompletionAdminNote()); assertNull(response.getCompletionResolvedAt());
        assertEquals(LocalDateTime.of(2026, 10, 17, 10, 0), booking.getCompletedAt());
        assertThrows(BadRequestException.class, () -> service.respond(7L, new BookingCompletionResponseRequest(true, null, 2L), customer.getId()));
        report(); assertEquals(2, history.size());
        assertEquals(BookingCompletionDisputeStatus.REOPENED, history.get(0).getStatus());
        assertEquals(2, history.get(0).getCompletionVersion()); assertEquals(3, history.get(1).getCompletionVersion());
    }

    @Test void realOwnerCompletionResetsOnceAndGuestsDoNotNeedCustomerConfirmation() {
        booking.setStatus(BookingStatus.IN_PROGRESS);
        var complete = new BookingStatusUpdateRequest(); complete.setStatus(BookingStatus.COMPLETED);
        assertThrows(UnauthorizedException.class, () -> bookingService.updateBookingStatus(7L, complete, UUID.randomUUID()));
        bookingService.updateBookingStatus(7L, complete, owner.getId()); respond(true, null);
        var respondedAt = booking.getCompletionRespondedAt();
        bookingService.updateBookingStatus(7L, complete, owner.getId());
        assertEquals(3, booking.getCompletionVersion()); assertEquals(CompletionConfirmation.CONFIRMED, booking.getCompletionConfirmation());
        assertEquals(respondedAt, booking.getCompletionRespondedAt());
        booking.setCustomer(null); booking.setWalkInName("Khách vãng lai"); booking.setStatus(BookingStatus.IN_PROGRESS);
        var guest = bookingService.updateBookingStatus(7L, complete, owner.getId());
        assertEquals(CompletionConfirmation.CONFIRMED, guest.getCompletionConfirmation()); assertEquals(4, guest.getCompletionVersion());
        verifyNoInteractions(emails);
    }

    @Test void reopenCurrentOrFutureIntervalRejectsConflictingEmployeeAndLeavesCaseOpen() {
        booking.setScheduledAt(LocalDateTime.of(2026, 10, 17, 11, 0)); var dispute = report();
        when(bookings.findOverlapping(1L, booking.getScheduledAt(), booking.getScheduledAt().plusMinutes(60)))
                .thenReturn(List.of(Booking.builder().id(42L).employee(employee).build()));
        var error = assertThrows(BadRequestException.class,
                () -> service.resolve(dispute.getId(), resolveRequest(BookingCompletionDisputeStatus.REOPENED), adminId));
        assertTrue(error.getMessage().contains("Khung giờ gốc"));
        assertEquals(BookingCompletionDisputeStatus.OPEN, dispute.getStatus()); assertNull(dispute.getResolvedBy());
        assertEquals(BookingStatus.COMPLETED, booking.getStatus()); assertEquals(CompletionConfirmation.DISPUTED, booking.getCompletionConfirmation());
        assertNull(booking.getCompletionAdminNote());
    }

    @Test void reopenAllowsAnotherEmployeeAndExcludesSelfWithSalonThenBookingThenCaseLockOrder() {
        booking.setScheduledAt(LocalDateTime.of(2026, 10, 17, 11, 0)); var dispute = report();
        when(bookings.findOverlapping(1L, booking.getScheduledAt(), booking.getScheduledAt().plusMinutes(60)))
                .thenReturn(List.of(booking, Booking.builder().id(42L).employee(Employee.builder().id(4L).build()).build()));
        clearInvocations(salons, bookings, disputes);
        service.resolve(dispute.getId(), resolveRequest(BookingCompletionDisputeStatus.REOPENED), adminId);
        var order = inOrder(salons, bookings, disputes);
        order.verify(disputes).findTargetById(dispute.getId()); order.verify(salons).findForUpdateById(1L);
        order.verify(bookings).findForUpdateById(7L); order.verify(disputes).findForUpdateById(dispute.getId());
        assertEquals(BookingStatus.IN_PROGRESS, booking.getStatus());
    }

    @Test void unassignedCurrentOverlapsBlockReopenAndStaleCasesCannotResolve() {
        booking.setScheduledAt(LocalDateTime.of(2026, 10, 17, 11, 0)); var dispute = report();
        when(bookings.findOverlapping(any(), any(), any())).thenReturn(List.of(Booking.builder().id(42L).build()));
        assertThrows(BadRequestException.class, () -> service.resolve(dispute.getId(), resolveRequest(BookingCompletionDisputeStatus.REOPENED), adminId));
        booking.setCompletionVersion(3);
        assertThrows(BadRequestException.class, () -> service.resolve(dispute.getId(), resolveRequest(BookingCompletionDisputeStatus.UPHELD), adminId));
        assertEquals(BookingCompletionDisputeStatus.OPEN, dispute.getStatus());
    }

    @Test void validatesAdminQueryPathAndConclusionsAndListsCaseContacts() {
        for (int[] page : List.of(new int[]{-1, 20}, new int[]{0, 0}, new int[]{0, 101})) {
            assertThrows(BadRequestException.class, () -> service.list(null, page[0], page[1]));
        }
        assertThrows(BadRequestException.class, () -> service.list("UNKNOWN", 0, 20));
        assertThrows(BadRequestException.class, () -> service.get(-1L));
        assertThrows(ResourceNotFoundException.class, () -> service.get(999L));
        for (var body : List.of(new BookingCompletionResolutionRequest(BookingCompletionDisputeStatus.OPEN, "Kết luận"),
                new BookingCompletionResolutionRequest(BookingCompletionDisputeStatus.UPHELD, "  "),
                new BookingCompletionResolutionRequest(BookingCompletionDisputeStatus.UPHELD, "x".repeat(2001)))) {
            assertThrows(BadRequestException.class, () -> service.resolve(1L, body, adminId));
        }
        var dispute = report();
        when(disputes.findByStatus(eq(BookingCompletionDisputeStatus.OPEN), any(Pageable.class))).thenReturn(new PageImpl<>(List.of(dispute)));
        when(disputes.findAll(any(Pageable.class))).thenReturn(new PageImpl<>(List.of(dispute)));
        assertEquals(1, service.list("OPEN", 0, 20).getTotalElements()); assertEquals(1, service.list(null, 0, 20).getContent().size());
        assertEquals("0901234567", service.get(dispute.getId()).getCustomerPhone());
    }
}
