package com.bookingnailms.repository;

import com.bookingnailms.entity.BookingEmail;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.time.Instant;
import java.util.List;

public interface BookingEmailRepository extends JpaRepository<BookingEmail, Long> {
    @Modifying
    @Query(value = "insert into booking_emails (booking_id, kind, recipient, subject, body, next_attempt_at, attempts) " +
            "values (:bookingId, 'APPOINTMENT_REMINDER', :recipient, :subject, :body, :now, 0) " +
            "on conflict (booking_id, kind) do nothing", nativeQuery = true)
    int enqueueAppointmentReminder(@Param("bookingId") Long bookingId, @Param("recipient") String recipient,
            @Param("subject") String subject, @Param("body") String body, @Param("now") Instant now);

    @Query(value = "select * from booking_emails where sent_at is null and next_attempt_at <= current_timestamp order by next_attempt_at, id limit 10 for update skip locked", nativeQuery = true)
    List<BookingEmail> lockDueEmails();
}
