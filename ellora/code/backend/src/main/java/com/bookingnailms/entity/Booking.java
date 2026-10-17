package com.bookingnailms.entity;

import com.bookingnailms.enums.BookingStatus;
import com.bookingnailms.enums.CompletionConfirmation;
import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;

@Entity
@Table(name = "bookings")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
@EntityListeners(AuditingEntityListener.class)
public class Booking {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "customer_id")
    private User customer;

    @Column(length = 255)
    private String walkInName;

    @Column(length = 255)
    private String guestEmail;

    @Column(name = "walk_in_phone", length = 20)
    private String customerPhone;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "salon_id", nullable = false)
    private Salon salon;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "service_id", nullable = false)
    private NailService service;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id")
    private Employee employee;

    @Column(nullable = false)
    private LocalDateTime scheduledAt;

    @Column(nullable = false)
    private Integer durationMinutes;

    @Column(precision = 15, scale = 0)
    private java.math.BigDecimal servicePriceSnapshot;



    private LocalDateTime completedAt;

    @Enumerated(EnumType.STRING)
    @Column(length = 32)
    private CompletionConfirmation completionConfirmation;

    @Column(nullable = false)
    private long completionVersion;

    private LocalDateTime completionRespondedAt;
    @Column(length = 1000)
    private String completionCustomerNote;
    @Column(length = 2000)
    private String completionAdminNote;
    private LocalDateTime completionResolvedAt;

    public CompletionConfirmation effectiveCompletionConfirmation() {
        if (completionConfirmation != null) return completionConfirmation;
        return status == BookingStatus.COMPLETED
                ? (review == null ? CompletionConfirmation.PENDING : CompletionConfirmation.CONFIRMED) : null;
    }

    @Builder.Default
    private boolean revenueEstimated = false;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private BookingStatus status = BookingStatus.PENDING;

    @Column(columnDefinition = "TEXT")
    private String customerNote;

    @Column(columnDefinition = "TEXT")
    private String salonNote;

    @Column(columnDefinition = "TEXT")
    private String cancellationReason;

    @OneToOne(mappedBy = "booking", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private Payment payment;

    @OneToOne(mappedBy = "booking", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private Review review;

    @CreatedDate
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;

    public boolean isWalkIn() { return customer == null && (guestEmail == null || guestEmail.isBlank()); }
    public String contactEmail() { return customer == null ? guestEmail : customer.getEmail(); }
    public String contactName() {
        return customer == null ? (walkInName == null ? "Khách vãng lai" : walkInName) : customer.getFullName();
    }
}
