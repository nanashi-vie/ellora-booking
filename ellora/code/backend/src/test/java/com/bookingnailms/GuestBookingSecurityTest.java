package com.bookingnailms;

import com.bookingnailms.config.SecurityConfig;
import com.bookingnailms.controller.booking.GuestBookingController;
import com.bookingnailms.dto.booking.GuestBookingReceipt;
import com.bookingnailms.dto.booking.GuestBookingRequest;
import com.bookingnailms.entity.User;
import com.bookingnailms.enums.BookingStatus;
import com.bookingnailms.enums.Role;
import com.bookingnailms.repository.UserRepository;
import com.bookingnailms.service.BookingService;
import com.bookingnailms.service.GuestBookingRequestLimiter;
import com.bookingnailms.service.SessionRevocationService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(GuestBookingController.class)
@Import(SecurityConfig.class)
class GuestBookingSecurityTest {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @MockBean JwtDecoder jwtDecoder;
    @MockBean UserRepository users;
    @MockBean SessionRevocationService revokedTokens;
    @MockBean BookingService bookings;
    @MockBean GuestBookingRequestLimiter limiter;
    private final UUID userId = UUID.randomUUID();
    private static final String VALID = """
            {"salonId":1,"serviceId":2,"employeeId":3,"scheduledAt":"2026-10-18T09:07:00",
             "fullName":"Nguyễn Mai","phone":"0901234567","email":"mai@example.test","customerNote":"Sơn gel"}
            """;

    @Test void anonymousCanBookAndReceivesOnlyAMinimalReceiptWithoutPrivateContactData() throws Exception {
        when(bookings.createGuestBooking(any())).thenReturn(new GuestBookingReceipt(7L, BookingStatus.PENDING,
                LocalDateTime.of(2026, 10, 18, 9, 7), "Ellora Nail", "Sơn gel"));
        ObjectNode body = (ObjectNode) json.readTree(VALID);
        body.put("customerId", UUID.randomUUID().toString());
        body.put("status", "CONFIRMED");

        String content = mvc.perform(post("/bookings/guest").contentType("application/json").content(body.toString()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.id").value(7))
                .andExpect(jsonPath("$.data.status").value("PENDING"))
                .andExpect(jsonPath("$.data.scheduledAt").value("2026-10-18T09:07:00"))
                .andExpect(jsonPath("$.data.salonName").value("Ellora Nail"))
                .andExpect(jsonPath("$.data.serviceName").value("Sơn gel"))
                .andReturn().getResponse().getContentAsString();
        assertEquals(5, json.readTree(content).path("data").size());
        assertFalse(content.contains("mai@example.test"));
        assertFalse(content.contains("0901234567"));
        ArgumentCaptor<GuestBookingRequest> request = ArgumentCaptor.forClass(GuestBookingRequest.class);
        verify(bookings).createGuestBooking(request.capture());
        assertEquals("Nguyễn Mai", request.getValue().fullName());
        assertEquals("0901234567", request.getValue().phone());
        assertEquals("mai@example.test", request.getValue().email());
        verify(limiter).check("mai@example.test");
        verifyNoInteractions(users);
    }

    @ParameterizedTest
    @MethodSource("invalidBodies")
    void requiredContactsDateAndIdsAreValidatedBeforeLimiterOrBooking(String body) throws Exception {
        mvc.perform(post("/bookings/guest").contentType("application/json").content(body))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(bookings, limiter);
    }

    static Stream<String> invalidBodies() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        var bodies = new java.util.ArrayList<String>();
        for (String field : new String[]{"salonId", "serviceId", "scheduledAt", "fullName", "phone", "email"}) {
            ObjectNode body = (ObjectNode) mapper.readTree(VALID);
            body.remove(field);
            bodies.add(body.toString());
        }
        for (String field : new String[]{"fullName", "phone", "email"}) {
            ObjectNode body = (ObjectNode) mapper.readTree(VALID);
            body.put(field, "   ");
            bodies.add(body.toString());
        }
        for (String phone : new String[]{"abcdefghij", "----------", "123", "090<script>"}) {
            ObjectNode body = (ObjectNode) mapper.readTree(VALID);
            body.put("phone", phone);
            bodies.add(body.toString());
        }
        ObjectNode body = (ObjectNode) mapper.readTree(VALID);
        body.put("email", "not-an-email");
        bodies.add(body.toString());
        body = (ObjectNode) mapper.readTree(VALID);
        body.put("scheduledAt", "not-a-date");
        bodies.add(body.toString());
        bodies.add("{");
        return bodies.stream();
    }

    @Test void authenticatedCustomerCanAlsoUseTheGuestEndpoint() throws Exception {
        as(Role.CUSTOMER);
        mvc.perform(post("/bookings/guest").header("Authorization", "Bearer test-token")
                .contentType("application/json").content(VALID)).andExpect(status().isCreated());
        verify(bookings).createGuestBooking(any());
    }

    @ParameterizedTest
    @EnumSource(value = Role.class, names = {"SALON_OWNER", "ADMIN"})
    void ownersAndAdminsCannotBypassTheirBookingRestrictionViaTheGuestEndpoint(Role role) throws Exception {
        as(role);
        mvc.perform(post("/bookings/guest").header("Authorization", "Bearer test-token")
                .contentType("application/json").content(VALID)).andExpect(status().isForbidden());
        verifyNoInteractions(bookings, limiter);
    }

    @Test void makingGuestPostPublicDoesNotExposeOtherBookingMethodsOrPrivateRoutes() throws Exception {
        mvc.perform(get("/bookings/guest")).andExpect(status().isUnauthorized());
        mvc.perform(get("/bookings/my")).andExpect(status().isUnauthorized());
        mvc.perform(post("/bookings").contentType("application/json").content(VALID))
                .andExpect(status().isUnauthorized());
        mvc.perform(delete("/bookings/7")).andExpect(status().isUnauthorized());
        mvc.perform(get("/owner/bookings").param("salonId", "1")).andExpect(status().isUnauthorized());
        mvc.perform(get("/admin/booking-disputes")).andExpect(status().isUnauthorized());
        verifyNoInteractions(bookings, limiter);
    }

    @Test void rateLimitedGuestCannotCreateAnotherBookingOrQueueMoreMail() throws Exception {
        doThrow(new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS)).when(limiter).check("mai@example.test");
        mvc.perform(post("/bookings/guest").contentType("application/json").content(VALID))
                .andExpect(status().isTooManyRequests());
        verifyNoInteractions(bookings);
    }

    private void as(Role role) {
        when(jwtDecoder.decode("test-token")).thenReturn(Jwt.withTokenValue("test-token")
                .header("alg", "RS256").subject(userId.toString()).build());
        when(users.findById(userId)).thenReturn(Optional.of(User.builder()
                .id(userId).role(role).enabled(true).locked(false).build()));
    }
}
