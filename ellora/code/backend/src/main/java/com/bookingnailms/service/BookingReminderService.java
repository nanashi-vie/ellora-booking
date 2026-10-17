package com.bookingnailms.service;

import com.bookingnailms.entity.Booking;
import com.bookingnailms.enums.BookingStatus;
import com.bookingnailms.repository.BookingEmailRepository;
import com.bookingnailms.repository.BookingRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

@Service
public class BookingReminderService {
    public static final String KIND = "APPOINTMENT_REMINDER";
    private static final ZoneId VIETNAM = ZoneId.of("Asia/Ho_Chi_Minh");
    private final BookingRepository bookings;
    private final BookingEmailRepository emails;
    private final Clock clock;
    @Value("${app.mail.enabled:false}") private boolean enabled;

    @Autowired
    public BookingReminderService(BookingRepository bookings, BookingEmailRepository emails) {
        this(bookings, emails, Clock.systemUTC());
    }

    BookingReminderService(BookingRepository bookings, BookingEmailRepository emails, Clock clock) {
        this.bookings = bookings;
        this.emails = emails;
        this.clock = clock;
    }

    @Scheduled(fixedDelay = 60000)
    @Transactional
    public void enqueueDueReminders() {
        if (!enabled) return;
        Instant instant = clock.instant();
        LocalDateTime now = LocalDateTime.ofInstant(instant, VIETNAM);
        for (Booking booking : bookings.findReminderCandidates(now, now.plusHours(1), PageRequest.of(0, 100))) {
            if (!eligible(booking, instant)) continue;
            // The unique outbox key also protects concurrent scanners and restarts.
            emails.enqueueAppointmentReminder(booking.getId(), booking.contactEmail(),
                    "Ellora - Nhắc lịch hẹn #" + booking.getId(), body(booking), dueAt(booking));
        }
    }

    static boolean eligible(Booking booking, Instant instant) {
        Instant due = dueAt(booking);
        return due != null && !instant.isBefore(due) && instant.isBefore(due.plusSeconds(3600));
    }

    static Instant dueAt(Booking booking) {
        if (booking == null || booking.getStatus() != BookingStatus.CONFIRMED || booking.isWalkIn()
                || booking.contactEmail() == null || booking.contactEmail().isBlank()
                || booking.getScheduledAt() == null) return null;
        return booking.getScheduledAt().atZone(VIETNAM).toInstant().minusSeconds(3600);
    }

    static String body(Booking booking) {
        String body = "Lịch hẹn của bạn sắp đến giờ. Ellora nhắc bạn chuẩn bị và đến tiệm đúng giờ."
                + "\n\nMã lịch hẹn: #" + booking.getId()
                + "\nTiệm: " + booking.getSalon().getName()
                + "\nKhách hàng: " + booking.contactName()
                + "\nDịch vụ: " + booking.getService().getName()
                + "\nThời gian: " + booking.getScheduledAt().format(DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy"))
                + " (giờ Việt Nam)";
        if (booking.getSalon().getAddress() != null && !booking.getSalon().getAddress().isBlank()) {
            body += "\nĐịa chỉ: " + booking.getSalon().getAddress();
        }
        if (booking.getSalon().getPhone() != null && !booking.getSalon().getPhone().isBlank()) {
            body += "\nLiên hệ tiệm: " + booking.getSalon().getPhone();
        }
        return body + "\n\nNếu cần thay đổi lịch, vui lòng liên hệ tiệm để được hỗ trợ.";
    }
}
