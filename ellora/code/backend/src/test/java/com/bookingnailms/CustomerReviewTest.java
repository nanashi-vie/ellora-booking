package com.bookingnailms;

import com.bookingnailms.dto.review.ReviewRequest;
import com.bookingnailms.entity.*;
import com.bookingnailms.enums.BookingStatus;
import com.bookingnailms.enums.CompletionConfirmation;
import com.bookingnailms.repository.*;
import com.bookingnailms.service.ReviewService;
import com.bookingnailms.exception.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CustomerReviewTest {
    @Test void adminEditsAndDeletesReviewsWithRatingRecalculation() {
        Review review = Review.builder().id(9L).salon(salon).customer(customer).booking(booking).rating(5).build();
        booking.setReview(review);
        when(reviews.findForUpdateById(9L)).thenReturn(Optional.of(review));
        when(salons.findForUpdateById(2L)).thenReturn(Optional.of(salon));
        when(reviews.findBySalonIdOrderByCreatedAtDesc(eq(2L), any(Pageable.class)))
            .thenReturn(new PageImpl<>(List.of(review)));
        service.adminEdit(9L, new com.bookingnailms.dto.review.AdminReviewRequest(3, "Đã sửa"));
        assertEquals(3, review.getRating()); assertEquals("3.0", salon.getAverageRating().toString());
        service.adminReply(9L, "Phản hồi quản trị");
        assertEquals("Phản hồi quản trị", review.getSalonReply());
        service.adminReply(9L, null);
        assertNull(review.getSalonReply()); assertNotNull(review.getSalonRepliedAt());
        when(reviews.findBySalonIdOrderByCreatedAtDesc(eq(2L), any(Pageable.class))).thenReturn(new PageImpl<>(List.of()));
        service.adminDelete(9L);
        verify(reviews).delete(review); assertNull(booking.getReview());
        assertEquals(0, salon.getTotalReviews()); assertEquals("0.0", salon.getAverageRating().toString());
    }
    @Test void salonReplyCannotBeOverwrittenAfterFirstSubmission() {
        UUID ownerId = UUID.randomUUID();
        salon.setOwner(User.builder().id(ownerId).build());
        Review review = Review.builder().id(9L).salon(salon).customer(customer).build();
        when(reviews.findForUpdateById(9L)).thenReturn(Optional.of(review));
        when(reviews.save(review)).thenReturn(review);
        var reply = com.bookingnailms.dto.review.ReviewReplyRequest.builder().reply(" Cảm ơn bạn ").build();
        assertThrows(UnauthorizedException.class, () -> service.replyToReview(9L, reply, UUID.randomUUID()));
        service.replyToReview(9L, reply, ownerId);
        var repliedAt = review.getSalonRepliedAt();
        reply.setReply("Nội dung thay thế");
        assertThrows(BadRequestException.class, () -> service.replyToReview(9L, reply, ownerId));
        assertEquals("Cảm ơn bạn", review.getSalonReply());
        assertEquals(repliedAt, review.getSalonRepliedAt());
        verify(reviews, times(1)).save(review);
    }
    private final ReviewRepository reviews = mock(ReviewRepository.class);
    private final BookingRepository bookings = mock(BookingRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final SalonRepository salons = mock(SalonRepository.class);
    private final ReviewService service = new ReviewService(reviews, bookings, users, salons);
    private final User customer = User.builder().id(UUID.randomUUID()).fullName("Khách thử").build();
    private final Salon salon = Salon.builder().id(2L).build();
    private final Booking booking = Booking.builder().id(1L).customer(customer).salon(salon).status(BookingStatus.COMPLETED).build();
    private final ReviewRequest request = ReviewRequest.builder().bookingId(1L).rating(5).comment(" Rất tốt ").build();

    private void setup() {
        when(users.findById(customer.getId())).thenReturn(Optional.of(customer));
        when(bookings.findSalonIdById(1L)).thenReturn(Optional.of(2L));
        when(salons.findForUpdateById(2L)).thenReturn(Optional.of(salon));
        when(bookings.findForUpdateById(1L)).thenReturn(Optional.of(booking));
    }

    @Test void rejectsOtherCustomersUnfinishedAndDuplicateReviews() {
        setup();
        booking.setCustomer(User.builder().id(UUID.randomUUID()).build());
        assertThrows(UnauthorizedException.class, () -> service.createReview(request, customer.getId()));
        booking.setCustomer(customer); booking.setStatus(BookingStatus.CONFIRMED);
        assertThrows(BadRequestException.class, () -> service.createReview(request, customer.getId()));
        booking.setStatus(BookingStatus.COMPLETED);
        when(reviews.existsByBookingId(1L)).thenReturn(true);
        assertThrows(BadRequestException.class, () -> service.createReview(request, customer.getId()));
        verify(reviews, never()).save(any());
    }

    @ParameterizedTest @EnumSource(value = CompletionConfirmation.class, names = {"CONFIRMED", "ADMIN_CONFIRMED"})
    void savesReviewAndUpdatesSalonRating(CompletionConfirmation confirmation) {
        setup();
        booking.setCompletionConfirmation(confirmation);
        when(salons.findForUpdateById(2L)).thenReturn(Optional.of(salon));
        when(reviews.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        when(reviews.findBySalonIdOrderByCreatedAtDesc(eq(2L), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(Review.builder().rating(3).build(), Review.builder().rating(5).build())));
        var response = service.createReview(request, customer.getId());
        assertEquals("Rất tốt", response.getComment());
        assertEquals(5, response.getRating());
        assertEquals(2, salon.getTotalReviews());
        assertEquals("4.0", salon.getAverageRating().toString());
        verify(salons).save(salon);
        var order = inOrder(bookings, salons);
        order.verify(bookings).findSalonIdById(1L);
        order.verify(salons).findForUpdateById(2L);
        order.verify(bookings).findForUpdateById(1L);
    }

    @ParameterizedTest @EnumSource(value = CompletionConfirmation.class, names = {"PENDING", "DISPUTED", "REOPENED"})
    void customerMustConfirmServiceBeforeNewReview(CompletionConfirmation confirmation) {
        setup(); booking.setCompletionConfirmation(confirmation);
        assertThrows(BadRequestException.class, () -> service.createReview(request, customer.getId()));
        verify(reviews, never()).save(any()); verify(salons, never()).save(any());
    }

    @Test void validatesStarRangeAndCommentLength() {
        try (var factory = jakarta.validation.Validation.buildDefaultValidatorFactory()) {
            var validator = factory.getValidator();
            for (Integer rating : Arrays.asList(null, 0, 6)) {
                request.setRating(rating); assertFalse(validator.validate(request).isEmpty());
            }
            request.setRating(5); request.setComment("x".repeat(1001));
            assertFalse(validator.validate(request).isEmpty());
            request.setComment(""); assertTrue(validator.validate(request).isEmpty());
        }
    }
}
