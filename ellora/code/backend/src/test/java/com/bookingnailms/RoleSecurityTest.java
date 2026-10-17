package com.bookingnailms;

import com.bookingnailms.config.SecurityConfig;
import com.bookingnailms.controller.salon.SalonRegistrationController;
import com.bookingnailms.controller.booking.BookingController;
import com.bookingnailms.entity.User;
import com.bookingnailms.entity.Salon;
import com.bookingnailms.enums.Role;
import com.bookingnailms.repository.*;
import com.bookingnailms.service.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.web.servlet.MockMvc;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest({SalonRegistrationController.class, BookingController.class, com.bookingnailms.controller.owner.OwnerController.class, com.bookingnailms.controller.admin.AdminContentController.class, com.bookingnailms.controller.admin.PlatformBillingController.class, com.bookingnailms.controller.owner.OwnerRevenueController.class})
@Import({SecurityConfig.class,com.bookingnailms.controller.admin.AdminUserController.class,com.bookingnailms.controller.profile.ProfileController.class})
class RoleSecurityTest {
    @Autowired MockMvc mvc;
    @MockBean JwtDecoder jwtDecoder;
    @MockBean UserRepository users;
    @MockBean SessionRevocationService revokedTokens;
    @MockBean SalonWorkingHourService workingHours;
    @MockBean SalonRepository salons;
    @MockBean SalonService salonService;
    @MockBean SalonProfileChangeService profileChanges;
    @MockBean AdminService admin;
    @MockBean BookingService bookings;
    @MockBean NailServiceService services;
    @MockBean EmployeeService employees;
    @MockBean ReviewService reviews;
    @MockBean OwnerDashboardService dashboard;
    @MockBean AdminContentService content;
    @MockBean PlatformBillingService billing;
    @MockBean OwnerRevenueService revenue;
    @MockBean ProfileService profiles;
    @MockBean CloudinaryImageService images;

    @Test void adminCannotBookOrRegisterBusiness() throws Exception {
        as(Role.ADMIN);
        mvc.perform(post("/bookings").header("Authorization","Bearer test-token").contentType("application/json")
                .content("{\"salonId\":1,\"serviceId\":2,\"scheduledAt\":\"2026-10-01T10:00:00\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/business/registration").header("Authorization","Bearer test-token").contentType("application/json")
                .content("{\"name\":\"Salon\",\"address\":\"Address\",\"city\":\"HCM\",\"district\":\"Quận 1\"}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(bookings,salonService);
    }

    @Test void ownerCannotUseCustomerBookingEndpoints() throws Exception {
        as(Role.SALON_OWNER);
        mvc.perform(get("/bookings/my").header("Authorization","Bearer test-token")).andExpect(status().isForbidden());
        mvc.perform(post("/bookings").header("Authorization","Bearer test-token").contentType("application/json")
                .content("{\"salonId\":1,\"serviceId\":2,\"scheduledAt\":\"2026-10-01T10:00:00\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/bookings/1").header("Authorization","Bearer test-token")).andExpect(status().isForbidden());
        mvc.perform(post("/reviews").header("Authorization","Bearer test-token").contentType("application/json")
                .content("{\"bookingId\":1,\"rating\":5}")).andExpect(status().isForbidden());
        verifyNoInteractions(bookings,reviews);
        as(Role.CUSTOMER);
        mvc.perform(get("/bookings/my").header("Authorization","Bearer test-token")).andExpect(status().isOk());
        verify(bookings).getMyBookings(eq(id),any());
    }

    @Test void customerBookingPhoneUsesRequestAndAuthenticatedCustomerWithLegacyRequestsAllowed() throws Exception {
        as(Role.CUSTOMER);
        String fields = "\"salonId\":1,\"serviceId\":2,\"scheduledAt\":\"2026-10-17T11:07:00\"";
        mvc.perform(post("/bookings").header("Authorization", "Bearer test-token").contentType("application/json")
                .content("{" + fields + ",\"customerPhone\":\"+84 (90) 123-4567\",\"customerId\":\"" + UUID.randomUUID() + "\"}"))
                .andExpect(status().isCreated());
        verify(bookings).createBooking(argThat(request -> "+84 (90) 123-4567".equals(request.getCustomerPhone())), eq(id));
        mvc.perform(post("/bookings").header("Authorization", "Bearer test-token").contentType("application/json")
                .content("{" + fields + "}")).andExpect(status().isCreated());
        verify(bookings).createBooking(argThat(request -> request.getCustomerPhone() == null), eq(id));
        mvc.perform(post("/bookings").header("Authorization", "Bearer test-token").contentType("application/json")
                .content("{" + fields + ",\"customerPhone\":\"\"}")).andExpect(status().isCreated());
        verify(bookings).createBooking(argThat(request -> "".equals(request.getCustomerPhone())), eq(id));
        verifyNoInteractions(profiles);
    }

    @ParameterizedTest
    @ValueSource(strings = { "invalid", "1234567", "123456789012345678901", "090/123/4567", "        ", "--------" })
    void customerBookingRejectsInvalidPhoneBeforeCallingService(String phone) throws Exception {
        as(Role.CUSTOMER);
        mvc.perform(post("/bookings").header("Authorization", "Bearer test-token").contentType("application/json")
                .content("{\"salonId\":1,\"serviceId\":2,\"scheduledAt\":\"2026-10-17T11:07:00\",\"customerPhone\":\"" + phone + "\"}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(bookings, profiles);
    }

    @Test void walkInsAndClosuresAreOwnerOnlyAndUseJwtIdentity() throws Exception {
        String body = "{\"serviceId\":2,\"scheduledAt\":\"2026-10-15T10:00:00\",\"salonId\":999}";
        for (Role role : List.of(Role.CUSTOMER, Role.ADMIN)) {
            as(role);
            mvc.perform(post("/owner/bookings/walk-ins").header("Authorization", "Bearer test-token")
                    .contentType("application/json").content(body)).andExpect(status().isForbidden());
            mvc.perform(post("/owner/salon/closures").header("Authorization", "Bearer test-token")
                    .contentType("application/json").content("{\"date\":\"2026-10-15\"}")).andExpect(status().isForbidden());
        }
        verifyNoInteractions(bookings, workingHours);
        as(Role.SALON_OWNER);
        mvc.perform(post("/owner/bookings/walk-ins").header("Authorization", "Bearer test-token")
                .contentType("application/json").content(body)).andExpect(status().isCreated());
        verify(bookings).createWalkIn(any(), eq(id));
        mvc.perform(post("/owner/salon/closures").header("Authorization", "Bearer test-token")
                .contentType("application/json").content("{\"date\":\"2026-10-15\",\"reason\":\"Bận\"}")).andExpect(status().isOk());
        verify(workingHours).closeDate(eq(id), any());
        mvc.perform(post("/owner/bookings/walk-ins").header("Authorization", "Bearer test-token")
                .contentType("application/json").content("{\"serviceId\":2}")).andExpect(status().isBadRequest());
    }

    @Test void profileUpdatesUseJwtIdentityAndValidateFields() throws Exception {
        as(Role.CUSTOMER);
        mvc.perform(put("/profiles/me").header("Authorization","Bearer test-token").contentType("application/json")
                .content("{\"fullName\":\"Linh mới\",\"phone\":\"0901234567\",\"role\":\"ADMIN\"}"))
                .andExpect(status().isOk());
        verify(profiles).update(eq(id),argThat(r->r.fullName().equals("Linh mới")));
        mvc.perform(put("/profiles/me").header("Authorization","Bearer test-token").contentType("application/json")
                .content("{\"fullName\":\"  \",\"phone\":\"invalid\"}")).andExpect(status().isBadRequest());
        verify(profiles,times(1)).update(any(),any());
    }

    @Test void userManagementIsAdminOnlyAndLockedTokensAreRejected() throws Exception {
        UUID target=UUID.randomUUID();
        for(Role role:List.of(Role.CUSTOMER,Role.SALON_OWNER)) {
            as(role);
            mvc.perform(get("/admin/users").header("Authorization","Bearer test-token")).andExpect(status().isForbidden());
            mvc.perform(patch("/admin/users/"+target+"/lock").header("Authorization","Bearer test-token").contentType("application/json")
                    .content("{\"locked\":true}")).andExpect(status().isForbidden());
        }
        verifyNoInteractions(admin);
        as(Role.ADMIN);
        mvc.perform(patch("/admin/users/"+target+"/lock").header("Authorization","Bearer test-token").contentType("application/json")
                .content("{\"locked\":true}")).andExpect(status().isOk());
        verify(admin).setUserLocked(target,true,id);
        when(users.findById(id)).thenReturn(Optional.of(User.builder().id(id).role(Role.CUSTOMER).locked(true).build()));
        mvc.perform(get("/profiles/me").header("Authorization","Bearer test-token")).andExpect(status().isUnauthorized());
    }

    @Test void salonUpdateResolvesSalonFromOwnerInsteadOfRequest() throws Exception {
        String body="{\"name\":\"Tiệm mới\",\"address\":\"Địa chỉ\",\"city\":\"HCM\",\"district\":\"Quận 1\",\"salonId\":999}";
        as(Role.CUSTOMER);
        mvc.perform(put("/owner/salon").header("Authorization","Bearer test-token").contentType("application/json").content(body)).andExpect(status().isForbidden());
        as(Role.SALON_OWNER);
        when(salonService.getMySalon(id)).thenReturn(com.bookingnailms.dto.salon.SalonResponse.builder().id(42L).build());
        mvc.perform(put("/owner/salon").header("Authorization","Bearer test-token").contentType("application/json").content(body)).andExpect(status().isOk());
        verify(profileChanges).submit(eq(id),any());
    }

    @Test void onlyAdminCanReviewChangesAndOwnerReadsOwnRequest() throws Exception {
        mvc.perform(get("/admin/salon-changes")).andExpect(status().isUnauthorized());
        for (Role role : List.of(Role.CUSTOMER, Role.SALON_OWNER)) {
            as(role);
            mvc.perform(get("/admin/salon-changes").header("Authorization","Bearer test-token")).andExpect(status().isForbidden());
            for (String action : List.of("approve", "reject")) {
                mvc.perform(post("/admin/salon-changes/9/"+action).header("Authorization","Bearer test-token")).andExpect(status().isForbidden());
            }
        }
        verifyNoInteractions(profileChanges);
        as(Role.SALON_OWNER);
        mvc.perform(get("/owner/salon/change-request?salonId=999").header("Authorization","Bearer test-token")).andExpect(status().isOk());
        verify(profileChanges).latest(id);
        mvc.perform(put("/owner/salon").header("Authorization","Bearer test-token").contentType("application/json")
                .content("{\"name\":\" \",\"address\":\"A\",\"city\":\"HCM\",\"district\":\"Q1\"}")).andExpect(status().isBadRequest());
        verify(profileChanges,never()).submit(any(),any());
        as(Role.ADMIN);
        mvc.perform(post("/admin/salon-changes/9/approve").header("Authorization","Bearer test-token")).andExpect(status().isOk());
        verify(profileChanges).review(9L,true,id);
        mvc.perform(post("/admin/salon-changes/10/reject").header("Authorization","Bearer test-token")).andExpect(status().isOk());
        verify(profileChanges).review(10L,false,id);
    }

    @Test void billingControlsAreAdminOnlyAndOwnerReportUsesJwtIdentity() throws Exception {
        for(Role role:List.of(Role.CUSTOMER,Role.SALON_OWNER)){
            as(role);
            mvc.perform(put("/admin/billing/config").header("Authorization","Bearer test-token").contentType("application/json").content("{\"percent\":3}")).andExpect(status().isForbidden());
            mvc.perform(post("/admin/billing/statements/42/confirm?month=2026-09").header("Authorization","Bearer test-token").contentType("application/json").content("{\"expectedDue\":1500}")).andExpect(status().isForbidden());
            mvc.perform(post("/admin/billing/statements/42/remind?month=2026-09").header("Authorization","Bearer test-token")).andExpect(status().isForbidden());
        }
        verifyNoInteractions(billing);
        as(Role.SALON_OWNER);
        mvc.perform(get("/owner/revenue?from=2026-09-01&to=2026-09-30&groupBy=month&salonId=999").header("Authorization","Bearer test-token")).andExpect(status().isOk());
        verify(revenue).report(eq(id),any(),any(),eq("month"));
        as(Role.ADMIN);
        mvc.perform(put("/admin/billing/config").header("Authorization","Bearer test-token").contentType("application/json").content("{\"percent\":101,\"effectiveDate\":\"2024-02-15\"}")).andExpect(status().isBadRequest());
        mvc.perform(put("/admin/billing/config").header("Authorization","Bearer test-token").contentType("application/json").content("{\"percent\":3}")).andExpect(status().isOk());
        mvc.perform(put("/admin/billing/config").header("Authorization","Bearer test-token").contentType("application/json").content("{\"percent\":null}")).andExpect(status().isBadRequest());
        verify(billing).setRate(new java.math.BigDecimal("3"));
    }

    @Test void onlyAdminCanModerateContent() throws Exception {
        for (Role role : List.of(Role.CUSTOMER, Role.SALON_OWNER)) {
            as(role);
            mvc.perform(get("/admin/content/salons").header("Authorization", "Bearer test-token")).andExpect(status().isForbidden());
            mvc.perform(delete("/admin/content/reviews/1").header("Authorization", "Bearer test-token")).andExpect(status().isForbidden());
            mvc.perform(delete("/admin/content/reviews/1/reply").header("Authorization", "Bearer test-token")).andExpect(status().isForbidden());
            mvc.perform(delete("/admin/content/salons/2/photos/cover/2").header("Authorization", "Bearer test-token")).andExpect(status().isForbidden());
        }
        verifyNoInteractions(content, reviews);
        as(Role.ADMIN);
        mvc.perform(put("/admin/content/reviews/1").header("Authorization", "Bearer test-token")
                .contentType("application/json").content("{\"rating\":4,\"comment\":\"Đã kiểm duyệt\"}")).andExpect(status().isOk());
        verify(reviews).adminEdit(eq(1L), any());
        mvc.perform(delete("/admin/content/reviews/1/reply").header("Authorization", "Bearer test-token")).andExpect(status().isOk());
        verify(reviews).adminReply(1L, null);
    }
    private final UUID id = UUID.randomUUID();

    void as(Role role) {
        when(jwtDecoder.decode("test-token")).thenReturn(Jwt.withTokenValue("test-token").header("alg", "RS256").subject(id.toString()).build());
        when(users.findById(id)).thenReturn(Optional.of(User.builder().id(id).role(role).enabled(true).locked(false).build()));
    }

    @Test void anonymousCannotReadAdminQueue() throws Exception {
        mvc.perform(get("/admin/salons/pending"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("X-Frame-Options", "DENY"))
                .andExpect(header().string("Referrer-Policy", "strict-origin-when-cross-origin"))
                .andExpect(header().string("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()"));
    }
    @Test void ownerServiceCreationUsesAuthenticatedSalonAndRejectsInvalidInput() throws Exception {
        as(Role.SALON_OWNER);
        when(salonService.getMySalon(id)).thenReturn(com.bookingnailms.dto.salon.SalonResponse.builder().id(42L).build());
        mvc.perform(post("/owner/services").header("Authorization", "Bearer test-token")
                .contentType("application/json")
                .content("{\"name\":\"Gel nails\",\"price\":150000,\"durationMinutes\":45,\"salonId\":999}"))
                .andExpect(status().isOk());
        verify(services).addService(any(), eq(42L));
        mvc.perform(post("/owner/services").header("Authorization", "Bearer test-token")
                .contentType("application/json").content("{\"name\":\"\",\"price\":-1,\"durationMinutes\":0}"))
                .andExpect(status().isBadRequest());
        verifyNoMoreInteractions(services);
    }
    @Test void customerCannotManageOwnerData() throws Exception {
        as(Role.CUSTOMER);
        for (String path : List.of("/owner/services", "/owner/employees", "/owner/reviews", "/owner/dashboard")) {
            mvc.perform(get(path).header("Authorization", "Bearer test-token")).andExpect(status().isForbidden());
            mvc.perform(post(path).header("Authorization", "Bearer test-token")).andExpect(status().isForbidden());
        }
        verifyNoInteractions(services, employees, reviews, dashboard);
    }
    @Test void customerCannotApproveOrReadOwnerBookings() throws Exception {
        as(Role.CUSTOMER);
        mvc.perform(post("/admin/salons/1/approve").header("Authorization", "Bearer test-token")).andExpect(status().isForbidden());
        mvc.perform(get("/owner/bookings").param("salonId", "1").header("Authorization", "Bearer test-token")).andExpect(status().isForbidden());
        verifyNoInteractions(admin, bookings);
    }
    @Test void adminCanApproveAndRoleChangesAreReadFromDatabase() throws Exception {
        as(Role.ADMIN);
        mvc.perform(post("/admin/salons/1/approve").header("Authorization", "Bearer test-token")).andExpect(status().isOk());
        verify(admin).approveSalon(1L);
        as(Role.CUSTOMER);
        mvc.perform(post("/admin/salons/2/approve").header("Authorization", "Bearer test-token")).andExpect(status().isForbidden());
        verify(admin, never()).approveSalon(2L);
    }
    @Test void ownerCannotReadAnotherSalonsBookings() throws Exception {
        as(Role.SALON_OWNER);
        when(salons.findById(1L)).thenReturn(Optional.of(Salon.builder().owner(User.builder().id(UUID.randomUUID()).build()).build()));
        mvc.perform(get("/owner/bookings").param("salonId", "1").header("Authorization", "Bearer test-token")).andExpect(status().isForbidden());
        verifyNoInteractions(bookings);
    }
    @Test void lockedAccountCannotUseProtectedEndpoints() throws Exception {
        as(Role.ADMIN);
        users.findById(id).orElseThrow().setLocked(true);
        mvc.perform(get("/admin/salons/pending").header("Authorization", "Bearer test-token")).andExpect(status().isUnauthorized());
    }
    @Test void loggedOutAccessTokenCannotBeReused() throws Exception {
        as(Role.CUSTOMER);
        when(revokedTokens.isRevoked("test-token")).thenReturn(true);
        mvc.perform(get("/profiles/me").header("Authorization", "Bearer test-token"))
                .andExpect(status().isUnauthorized());
        verify(profiles, never()).get(any());
    }
}
