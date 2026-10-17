package com.bookingnailms.service;

import com.bookingnailms.entity.Booking;
import com.bookingnailms.entity.BookingEmail;
import com.bookingnailms.repository.BookingEmailRepository;
import com.bookingnailms.repository.BookingRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.time.Clock;
import java.time.format.DateTimeFormatter;

@Service @Slf4j
public class BookingEmailService {
    private final BookingEmailRepository emails;
    private final JavaMailSender sender;
    private final BookingRepository bookings;
    private final Clock clock;
    @Value("${app.mail.from:}") private String from;
    @Value("${app.mail.enabled:false}") private boolean enabled;

    @Autowired
    public BookingEmailService(BookingEmailRepository emails, JavaMailSender sender, BookingRepository bookings) {
        this(emails, sender, bookings, Clock.systemUTC());
    }

    public BookingEmailService(BookingEmailRepository emails, JavaMailSender sender, BookingRepository bookings, Clock clock) {
        this.emails = emails;
        this.sender = sender;
        this.bookings = bookings;
        this.clock = clock;
    }

    // Saved in the booking transaction: rolled-back bookings never produce email.
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.MANDATORY)
    public void enqueue(Booking booking, boolean confirmed) {
        if (booking.isWalkIn()) return;
        BookingEmail email = new BookingEmail();
        email.setBookingId(booking.getId());
        email.setKind(confirmed ? "CONFIRMED" : "NEW_BOOKING");
        String salonEmail = booking.getSalon().getEmail();
        email.setRecipient(confirmed ? booking.contactEmail()
                : salonEmail != null && !salonEmail.isBlank() ? salonEmail : booking.getSalon().getOwner().getEmail());
        email.setSubject("Ellora - " + (confirmed ? "Đã xác nhận lịch hẹn #" : "Lịch hẹn mới #") + booking.getId());
        email.setBody((confirmed ? "Tiệm đã xác nhận lịch hẹn của bạn." : "Tiệm có lịch hẹn mới đang chờ xác nhận.")
                + "\n\nMã lịch hẹn: #" + booking.getId()
                + "\nTiệm: " + booking.getSalon().getName()
                + "\nKhách hàng: " + booking.contactName()
                + "\nDịch vụ: " + booking.getService().getName()
                + "\nThời gian: " + booking.getScheduledAt().format(DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy")) + " (giờ Việt Nam)"
                + "\n\n" + (confirmed ? "Vui lòng đến đúng giờ. Cảm ơn bạn đã đặt lịch tại Ellora." : "Vui lòng mở trang quản lý lịch hẹn Ellora để xác nhận."));
        emails.save(email);
    }

    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.MANDATORY)
    public void enqueueGuestReceipt(Booking booking) {
        if (booking.getGuestEmail() == null || booking.getGuestEmail().isBlank()) return;
        BookingEmail email = new BookingEmail();
        email.setBookingId(booking.getId());
        email.setKind("BOOKING_RECEIVED");
        email.setRecipient(booking.getGuestEmail());
        email.setSubject("Ellora - Đã nhận yêu cầu đặt lịch #" + booking.getId());
        email.setBody("Ellora đã nhận yêu cầu đặt lịch của bạn. Vui lòng chờ tiệm xác nhận qua email."
                + "\n\nMã lịch hẹn: #" + booking.getId()
                + "\nTrạng thái: Chờ tiệm xác nhận"
                + "\nTiệm: " + booking.getSalon().getName()
                + "\nKhách hàng: " + booking.contactName()
                + "\nSố điện thoại: " + booking.getCustomerPhone()
                + "\nDịch vụ: " + booking.getService().getName()
                + "\nThời gian: " + booking.getScheduledAt().format(DateTimeFormatter.ofPattern("HH:mm dd/MM/yyyy"))
                + " (giờ Việt Nam)"
                + "\n\nBạn sẽ được nhắc trước giờ hẹn khoảng 1 tiếng nếu lịch đã được tiệm xác nhận."
                + " Nếu cần thay đổi lịch, vui lòng liên hệ tiệm.");
        emails.save(email);
    }

    @Scheduled(fixedDelay = 10000)
    // This queue also holds explicit admin billing reminders (without a booking id).
    @Transactional
    public void deliver() {
        if (!enabled || from == null || from.isBlank()) return;
        for (BookingEmail email : emails.lockDueEmails()) {
            if (BookingReminderService.KIND.equals(email.getKind())) {
                Booking booking = email.getBookingId() == null ? null : bookings.findById(email.getBookingId()).orElse(null);
                Instant due = BookingReminderService.dueAt(booking);
                Instant now = clock.instant();
                if (due == null || !now.isBefore(due.plusSeconds(3600))) {
                    emails.delete(email);
                    continue;
                }
                if (now.isBefore(due)) {
                    email.setNextAttemptAt(due);
                    continue;
                }
                email.setRecipient(booking.contactEmail());
                email.setBody(BookingReminderService.body(booking));
            }
            try {
                var message = sender.createMimeMessage();
                var helper = new MimeMessageHelper(message, true, "UTF-8");
                helper.setFrom(from);
                helper.setTo(email.getRecipient());
                helper.setSubject(email.getSubject());
                helper.setText(email.getBody(), BookingEmailTemplate.render(email.getKind(), email.getBody()));
                sender.send(message);
                email.setSentAt(clock.instant());
            } catch (org.springframework.mail.MailException | jakarta.mail.MessagingException ex) {
                email.setAttempts(email.getAttempts() + 1);
                email.setNextAttemptAt(clock.instant().plusSeconds(Math.min(3600L, 30L * email.getAttempts())));
                log.warn("Booking email {} failed ({}); will retry", email.getId(), ex.getClass().getSimpleName());
            }
        }
        // SMTP is at-least-once: a crash after SMTP accepts but before commit can duplicate delivery.
    }

    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.MANDATORY)
    public void enqueueBillingReminder(String recipient, String body) {
        BookingEmail email = new BookingEmail();
        email.setKind("BILLING_REMINDER"); email.setRecipient(recipient);
        email.setSubject("Ellora - Nhắc thanh toán phí nền tảng"); email.setBody(body);
        emails.save(email);
    }
}
