package com.bookingnailms.service;

import com.bookingnailms.entity.PlatformSupportContact;
import com.bookingnailms.repository.PlatformSupportContactRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class PlatformSupportContactService {
    private final PlatformSupportContactRepository contacts;

    public record Contact(String email, String phone, String facebookUrl) {}

    @Transactional(readOnly = true)
    public Contact get() {
        return contacts.findById(1L).map(this::toContact).orElse(new Contact("", "", ""));
    }

    @Transactional
    @PreAuthorize("hasRole('ADMIN')")
    public Contact update(Contact request) {
        PlatformSupportContact settings = contacts.findById(1L).orElseGet(PlatformSupportContact::new);
        settings.setEmail(clean(request.email()));
        settings.setPhone(clean(request.phone()));
        settings.setFacebookUrl(clean(request.facebookUrl()));
        return toContact(contacts.save(settings));
    }

    private Contact toContact(PlatformSupportContact settings) {
        return new Contact(settings.getEmail(), settings.getPhone(), settings.getFacebookUrl());
    }

    private String clean(String value) { return value == null ? "" : value.trim(); }
}
