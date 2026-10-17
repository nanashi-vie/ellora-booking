package com.bookingnailms.service;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

@Component
public class GuestBookingRequestLimiter {
    private static final int LIMIT = 5;
    private static final int CAPACITY = 10_000;
    private static final Duration WINDOW = Duration.ofMinutes(10);
    private final Clock clock;
    private final Map<String, RequestWindow> recipients = new LinkedHashMap<>(16, 0.75f, true);

    public GuestBookingRequestLimiter() {
        this(Clock.systemUTC());
    }

    GuestBookingRequestLimiter(Clock clock) {
        this.clock = clock;
    }

    // ponytail: this quota is per instance; use shared storage if multiple workers need one quota.
    public synchronized void check(String email) {
        String recipient = email.trim().toLowerCase(Locale.ROOT);
        Instant now = clock.instant();
        RequestWindow window = recipients.get(recipient);
        if (window == null || !now.isBefore(window.expiresAt())) {
            recipients.put(recipient, new RequestWindow(now.plus(WINDOW), 1));
            if (recipients.size() > CAPACITY) recipients.remove(recipients.keySet().iterator().next());
            return;
        }
        if (window.requests() >= LIMIT) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS);
        recipients.put(recipient, new RequestWindow(window.expiresAt(), window.requests() + 1));
    }

    private record RequestWindow(Instant expiresAt, int requests) {}
}
