package com.bookingnailms.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;

@Entity
@Table(name = "salon_closures", uniqueConstraints = @UniqueConstraint(columnNames = {"salon_id", "closed_date"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class SalonClosure {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "salon_id", nullable = false)
    private Salon salon;
    @Column(name = "closed_date", nullable = false)
    private LocalDate date;
    @Column(length = 500)
    private String reason;
}
