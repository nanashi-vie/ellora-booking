package com.bookingnailms.controller.admin;

import com.bookingnailms.dto.common.ApiResponse;
import com.bookingnailms.service.PlatformSupportContactService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class PlatformSupportContactController {
    private final PlatformSupportContactService contacts;

    public record UpdateContact(
            @Email(message = "Email hỗ trợ không hợp lệ") @Size(max = 254) String email,
            @Pattern(regexp = "^[+0-9() .-]{0,30}$", message = "Số điện thoại hỗ trợ không hợp lệ") String phone,
            @Pattern(regexp = "^(|https?://([A-Za-z0-9-]+\\.)*(facebook\\.com|fb\\.com)(/[^\\s]{0,450})?)$", message = "Vui lòng nhập link Facebook hợp lệ") String facebookUrl) {
        PlatformSupportContactService.Contact toContact() {
            return new PlatformSupportContactService.Contact(email, phone, facebookUrl);
        }
    }

    @GetMapping("/support/contact")
    public ApiResponse<PlatformSupportContactService.Contact> get() {
        return ApiResponse.success(contacts.get(), null);
    }

    @PutMapping("/admin/support/contact")
    public ApiResponse<PlatformSupportContactService.Contact> update(@Valid @RequestBody UpdateContact request) {
        return ApiResponse.success(contacts.update(request.toContact()), "Đã lưu thông tin hỗ trợ.");
    }
}
