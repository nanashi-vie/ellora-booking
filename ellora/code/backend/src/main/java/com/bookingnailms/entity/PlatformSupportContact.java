package com.bookingnailms.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "platform_support_contacts")
@Getter
@Setter
@NoArgsConstructor
public class PlatformSupportContact {
    @Id
    private Long id = 1L;
    private String email;
    private String phone;
    private String facebookUrl;
}
