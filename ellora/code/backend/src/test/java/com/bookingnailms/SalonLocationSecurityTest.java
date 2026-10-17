package com.bookingnailms;

import com.bookingnailms.config.SecurityConfig;
import com.bookingnailms.controller.owner.OwnerController;
import com.bookingnailms.controller.salon.SalonRegistrationController;
import com.bookingnailms.dto.salon.SalonRequest;
import com.bookingnailms.entity.User;
import com.bookingnailms.enums.Role;
import com.bookingnailms.repository.UserRepository;
import com.bookingnailms.service.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest({OwnerController.class, SalonRegistrationController.class})
@Import(SecurityConfig.class)
class SalonLocationSecurityTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @MockBean JwtDecoder jwtDecoder;
    @MockBean UserRepository users;
    @MockBean SessionRevocationService revokedTokens;
    @MockBean SalonService salons;
    @MockBean SalonProfileChangeService profileChanges;
    @MockBean NailServiceService services;
    @MockBean EmployeeService employees;
    @MockBean ReviewService reviews;
    @MockBean OwnerDashboardService dashboard;
    @MockBean SalonWorkingHourService workingHours;
    @MockBean AdminService admin;
    private final UUID userId = UUID.randomUUID();
    private static final String BODY = """
            {"name":"Ellora Nail","description":"Giới thiệu","address":"12 Đường Hoa",
             "city":"HCM","district":"Quận 1","phone":"0901234567","email":"salon@example.test"}
            """;

    @Test void ownerCoordinatesAreOnlySubmittedForReviewUsingTheJwtIdentity() throws Exception {
        as(Role.SALON_OWNER);
        ObjectNode body = (ObjectNode) json.readTree(BODY);
        body.put("latitude", 10.75); body.put("longitude", 106.65);
        body.put("ownerId", UUID.randomUUID().toString()); body.put("salonId", 999);
        mvc.perform(put("/owner/salon").header("Authorization", "Bearer test-token")
                .contentType("application/json").content(body.toString())).andExpect(status().isOk());
        var proposed = ArgumentCaptor.forClass(SalonRequest.class);
        verify(profileChanges).submit(eq(userId), proposed.capture());
        assertEquals(10.75, proposed.getValue().getLatitude());
        assertEquals(106.65, proposed.getValue().getLongitude());
        verifyNoInteractions(salons, admin);
    }

    @ParameterizedTest
    @ValueSource(strings = {"\"latitude\":10.75", "\"longitude\":106.65", "\"latitude\":91,\"longitude\":106.65",
            "\"latitude\":10.75,\"longitude\":-181", "\"latitude\":\"NaN\",\"longitude\":106.65"})
    void invalidCoordinatesAreRejectedByOwnerAndRegistrationMvcValidation(String coordinates) throws Exception {
        ObjectNode body = (ObjectNode) json.readTree(BODY);
        body.setAll((ObjectNode) json.readTree("{" + coordinates + "}"));
        as(Role.SALON_OWNER);
        mvc.perform(put("/owner/salon").header("Authorization", "Bearer test-token")
                .contentType("application/json").content(body.toString())).andExpect(status().isBadRequest());
        as(Role.CUSTOMER);
        mvc.perform(post("/business/registration").header("Authorization", "Bearer test-token")
                .contentType("application/json").content(body.toString())).andExpect(status().isBadRequest());
        verifyNoInteractions(profileChanges, salons);
    }

    @Test void legacyOwnerRequestsWithoutCoordinatesRemainAccepted() throws Exception {
        as(Role.SALON_OWNER);
        mvc.perform(put("/owner/salon").header("Authorization", "Bearer test-token")
                .contentType("application/json").content(BODY)).andExpect(status().isOk());
        verify(profileChanges).submit(eq(userId), argThat(request -> request.getLatitude() == null && request.getLongitude() == null));
    }

    @ParameterizedTest @EnumSource(value = Role.class, names = {"CUSTOMER", "ADMIN"})
    void otherRolesCannotChangeOwnerLocation(Role role) throws Exception {
        as(role);
        mvc.perform(put("/owner/salon").header("Authorization", "Bearer test-token")
                .contentType("application/json").content(BODY)).andExpect(status().isForbidden());
        verifyNoInteractions(profileChanges, salons);
    }

    @Test void anonymousCannotEditOwnerLocationAndOwnersCannotApproveTheirOwnChange() throws Exception {
        mvc.perform(put("/owner/salon").contentType("application/json").content(BODY))
                .andExpect(status().isUnauthorized());
        as(Role.SALON_OWNER);
        mvc.perform(post("/admin/salon-changes/1/approve").header("Authorization", "Bearer test-token"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(profileChanges, salons);
    }

    private void as(Role role) {
        when(jwtDecoder.decode("test-token")).thenReturn(Jwt.withTokenValue("test-token")
                .header("alg", "RS256").subject(userId.toString()).build());
        when(users.findById(userId)).thenReturn(Optional.of(User.builder()
                .id(userId).role(role).enabled(true).locked(false).build()));
    }
}
