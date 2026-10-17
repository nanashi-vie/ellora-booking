package com.bookingnailms.service;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class GuestBookingRequestLimiterTest {
    private static final Instant NOW = Instant.parse("2026-10-18T01:00:00Z");
    private final Clock clock = mock(Clock.class);
    private final GuestBookingRequestLimiter limiter = new GuestBookingRequestLimiter(clock);

    GuestBookingRequestLimiterTest() {
        when(clock.instant()).thenReturn(NOW);
    }

    @Test void permitsFiveRequestsAndRejectsTheSixthWith429() {
        permitFive("mai@example.test");
        assertLimited("mai@example.test");
        assertLimited("mai@example.test");
    }

    @Test void trimsAndNormalizesEmailCaseForTheSameQuota() {
        limiter.check(" Mai@Example.Test ");
        limiter.check("mai@example.test");
        limiter.check("MAI@EXAMPLE.TEST");
        limiter.check("\tmai@example.test\n");
        limiter.check("mAi@example.test");
        assertLimited("  MAI@example.TEST  ");
    }

    @Test void resetsAtTenMinutesFromTheFirstRequestWithoutExtendingTheWindow() {
        limiter.check("mai@example.test");
        when(clock.instant()).thenReturn(NOW.plusSeconds(540));
        for (int i = 0; i < 4; i++) limiter.check("mai@example.test");
        when(clock.instant()).thenReturn(NOW.plusSeconds(600).minusNanos(1));
        assertLimited("mai@example.test");
        when(clock.instant()).thenReturn(NOW.plusSeconds(600));
        permitFive("mai@example.test");
        assertLimited("mai@example.test");
    }

    @Test void keepsRecipientQuotasIndependent() {
        permitFive("mai@example.test");
        permitFive("linh@example.test");
        assertLimited("mai@example.test");
        assertLimited("linh@example.test");
        assertDoesNotThrow(() -> limiter.check("lan@example.test"));
    }

    @Test void capsMemoryAtTenThousandRecipientsByEvictingTheLeastRecentlyUsedQuota() {
        permitFive("first@example.test");
        permitFive("second@example.test");
        for (int i = 2; i < 10_000; i++) limiter.check("customer" + i + "@example.test");
        assertLimited("first@example.test"); // Refresh its LRU position without changing expiry.
        limiter.check("new@example.test");
        assertLimited("first@example.test");
        assertDoesNotThrow(() -> limiter.check("second@example.test"));
    }

    @Test void expiresAnOldQuotaWhenItIsUsedAgain() {
        permitFive("mai@example.test");
        when(clock.instant()).thenReturn(NOW.plusSeconds(3600));
        permitFive("mai@example.test");
        assertLimited("mai@example.test");
    }

    @Test void concurrentRequestsShareOneFiveRequestQuota() throws Exception {
        var executor = Executors.newFixedThreadPool(8);
        try {
            List<Callable<Boolean>> attempts = new ArrayList<>();
            for (int i = 0; i < 20; i++) attempts.add(() -> {
                try {
                    limiter.check("mai@example.test");
                    return true;
                } catch (ResponseStatusException ex) {
                    assertEquals(HttpStatus.TOO_MANY_REQUESTS, ex.getStatusCode());
                    return false;
                }
            });
            int accepted = 0;
            for (var attempt : executor.invokeAll(attempts)) if (attempt.get()) accepted++;
            assertEquals(5, accepted);
        } finally {
            executor.shutdownNow();
        }
    }

    private void permitFive(String email) {
        for (int i = 0; i < 5; i++) assertDoesNotThrow(() -> limiter.check(email));
    }

    private void assertLimited(String email) {
        var failure = assertThrows(ResponseStatusException.class, () -> limiter.check(email));
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, failure.getStatusCode());
    }
}
