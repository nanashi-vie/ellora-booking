package com.bookingnailms.entity;

import com.bookingnailms.enums.BookingCompletionDisputeStatus;
import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "booking_completion_disputes", uniqueConstraints = @UniqueConstraint(
        name = "uq_booking_completion_dispute", columnNames = {"booking_id", "completion_version"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class BookingCompletionDispute {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "booking_id", nullable = false)
    private Booking booking;
    @Column(nullable = false)
    private long completionVersion;
    @Column(nullable = false, length = 1000)
    private String reason;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 16)
    private BookingCompletionDisputeStatus status;
    @Column(nullable = false)
    private LocalDateTime createdAt;
    private LocalDateTime resolvedAt;
    private UUID resolvedBy;
    @Column(length = 2000)
    private String adminNote;
}
