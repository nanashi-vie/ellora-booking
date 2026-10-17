package com.bookingnailms;

import com.bookingnailms.config.SecurityConfig;
import com.bookingnailms.controller.booking.BookingCompletionController;
import com.bookingnailms.dto.booking.BookingCompletionDisputeResponse;
import com.bookingnailms.dto.booking.BookingCompletionResolutionRequest;
import com.bookingnailms.dto.booking.BookingCompletionResponseRequest;
import com.bookingnailms.dto.booking.BookingResponse;
import com.bookingnailms.dto.common.PageResponse;
import com.bookingnailms.entity.User;
import com.bookingnailms.enums.BookingCompletionDisputeStatus;
import com.bookingnailms.enums.BookingStatus;
import com.bookingnailms.enums.Role;
import com.bookingnailms.repository.UserRepository;
import com.bookingnailms.service.BookingCompletionService;
import com.bookingnailms.service.SessionRevocationService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Stream;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(BookingCompletionController.class)
@Import(SecurityConfig.class)
class BookingCompletionSecurityTest {
    @Autowired MockMvc mvc;
    @MockBean JwtDecoder jwtDecoder;
    @MockBean UserRepository users;
    @MockBean SessionRevocationService revokedTokens;
    @MockBean BookingCompletionService completion;

    private final UUID id = UUID.randomUUID();

    @Test void anonymousCannotRespondOrAccessAdminCases() throws Exception {
        mvc.perform(post("/bookings/7/completion-response").contentType("application/json")
                .content("{\"completed\":true,\"completionVersion\":1}"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/admin/booking-disputes")).andExpect(status().isUnauthorized());
        mvc.perform(get("/admin/booking-disputes/9")).andExpect(status().isUnauthorized());
        mvc.perform(patch("/admin/booking-disputes/9/resolution").contentType("application/json")
                .content("{\"outcome\":\"UPHELD\",\"note\":\"Verified with both parties\"}"))
                .andExpect(status().isUnauthorized());
        verifyNoInteractions(completion);
    }

    @ParameterizedTest
    @EnumSource(value = Role.class, names = {"SALON_OWNER", "ADMIN"})
    void onlyCustomersCanSubmitCompletionResponses(Role role) throws Exception {
        as(role);
        mvc.perform(post("/bookings/7/completion-response").header("Authorization", "Bearer test-token")
                .contentType("application/json").content("{\"completed\":true,\"completionVersion\":1}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(completion);
    }

    @ParameterizedTest
    @EnumSource(value = Role.class, names = {"CUSTOMER", "SALON_OWNER"})
    void nonAdminsCannotReadPrivateContactsOrResolveCases(Role role) throws Exception {
        as(role);
        mvc.perform(get("/admin/booking-disputes").header("Authorization", "Bearer test-token"))
                .andExpect(status().isForbidden());
        mvc.perform(get("/admin/booking-disputes/9").header("Authorization", "Bearer test-token"))
                .andExpect(status().isForbidden());
        mvc.perform(patch("/admin/booking-disputes/9/resolution").header("Authorization", "Bearer test-token")
                .contentType("application/json").content("{\"outcome\":\"REOPENED\",\"note\":\"Customer did not attend\"}"))
                .andExpect(status().isForbidden());
        verifyNoInteractions(completion);
    }

    @Test void customerConfirmationUsesJwtIdentityAndDoesNotExposeAdminContacts() throws Exception {
        as(Role.CUSTOMER);
        var request = new BookingCompletionResponseRequest(true, null, 0L);
        when(completion.respond(7L, request, id)).thenReturn(BookingResponse.builder()
                .id(7L).status(BookingStatus.COMPLETED).build());

        mvc.perform(post("/bookings/7/completion-response").header("Authorization", "Bearer test-token")
                .contentType("application/json")
                .content("{\"completed\":true,\"completionVersion\":0,\"customerId\":\"" + UUID.randomUUID() + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(7))
                .andExpect(jsonPath("$.data.status").value("COMPLETED"))
                .andExpect(jsonPath("$.data.customerEmail").doesNotExist())
                .andExpect(jsonPath("$.data.ownerPhone").doesNotExist())
                .andExpect(jsonPath("$.data.ownerEmail").doesNotExist());
        verify(completion).respond(7L, request, id);
    }

    @Test void customerDisputePassesReasonAndVersionToService() throws Exception {
        as(Role.CUSTOMER);
        var request = new BookingCompletionResponseRequest(false, "Service was not provided", 4L);
        mvc.perform(post("/bookings/7/completion-response").header("Authorization", "Bearer test-token")
                .contentType("application/json")
                .content("{\"completed\":false,\"reason\":\"Service was not provided\",\"completionVersion\":4}"))
                .andExpect(status().isOk());
        verify(completion).respond(7L, request, id);
    }

    @ParameterizedTest
    @MethodSource("invalidCompletionBodies")
    void invalidCompletionBodiesAreRejectedBeforeService(String body) throws Exception {
        as(Role.CUSTOMER);
        mvc.perform(post("/bookings/7/completion-response").header("Authorization", "Bearer test-token")
                .contentType("application/json").content(body))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(completion);
    }

    static Stream<String> invalidCompletionBodies() {
        return Stream.of(
                "{\"completionVersion\":1}",
                "{\"completed\":null,\"completionVersion\":1}",
                "{\"completed\":true}",
                "{\"completed\":true,\"completionVersion\":null}",
                "{\"completed\":true,\"completionVersion\":-1}",
                "{\"completed\":false,\"completionVersion\":1,\"reason\":\"" + "x".repeat(1001) + "\"}",
                "{\"completed\":\"invalid\",\"completionVersion\":1}",
                "{");
    }

    @Test void adminListBindsDefaultAndExplicitFiltersAndReturnsPrivateContacts() throws Exception {
        as(Role.ADMIN);
        var response = PageResponse.<BookingCompletionDisputeResponse>builder()
                .content(List.of(privateCase())).pageNumber(0).pageSize(20)
                .totalElements(1).totalPages(1).last(true).build();
        when(completion.list(null, 0, 20)).thenReturn(response);

        mvc.perform(get("/admin/booking-disputes").header("Authorization", "Bearer test-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].id").value(9))
                .andExpect(jsonPath("$.data.content[0].customerPhone").value("0901234567"))
                .andExpect(jsonPath("$.data.content[0].customerEmail").value("customer@example.test"))
                .andExpect(jsonPath("$.data.content[0].ownerPhone").value("0912345678"))
                .andExpect(jsonPath("$.data.content[0].ownerEmail").value("owner@example.test"))
                .andExpect(jsonPath("$.data.content[0].salonPhone").value("02812345678"))
                .andExpect(jsonPath("$.data.content[0].salonEmail").value("salon@example.test"))
                .andExpect(jsonPath("$.data.content[0].salonAddress").value("12 Test Street"));
        verify(completion).list(null, 0, 20);

        mvc.perform(get("/admin/booking-disputes").header("Authorization", "Bearer test-token")
                .param("status", "UPHELD").param("page", "2").param("size", "5"))
                .andExpect(status().isOk());
        verify(completion).list("UPHELD", 2, 5);
    }

    @Test void adminCanReadCaseWithBothPartiesContactDetails() throws Exception {
        as(Role.ADMIN);
        when(completion.get(9L)).thenReturn(privateCase());
        mvc.perform(get("/admin/booking-disputes/9").header("Authorization", "Bearer test-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.bookingId").value(7))
                .andExpect(jsonPath("$.data.customerPhone").value("0901234567"))
                .andExpect(jsonPath("$.data.customerEmail").value("customer@example.test"))
                .andExpect(jsonPath("$.data.ownerPhone").value("0912345678"))
                .andExpect(jsonPath("$.data.ownerEmail").value("owner@example.test"))
                .andExpect(jsonPath("$.data.salonPhone").value("02812345678"))
                .andExpect(jsonPath("$.data.salonEmail").value("salon@example.test"))
                .andExpect(jsonPath("$.data.salonAddress").value("12 Test Street"));
        verify(completion).get(9L);
    }

    @ParameterizedTest
    @EnumSource(value = BookingCompletionDisputeStatus.class, names = {"UPHELD", "REOPENED"})
    void adminResolutionUsesJwtIdentityInsteadOfBodyIdentity(BookingCompletionDisputeStatus outcome) throws Exception {
        as(Role.ADMIN);
        var request = new BookingCompletionResolutionRequest(outcome, "Verified with both parties");
        when(completion.resolve(9L, request, id)).thenReturn(BookingCompletionDisputeResponse.builder()
                .id(9L).bookingId(7L).status(outcome).resolvedBy(id)
                .adminNote("Verified with both parties").build());

        mvc.perform(patch("/admin/booking-disputes/9/resolution").header("Authorization", "Bearer test-token")
                .contentType("application/json")
                .content("{\"outcome\":\"" + outcome + "\",\"note\":\"Verified with both parties\",\"adminId\":\""
                        + UUID.randomUUID() + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value(outcome.name()))
                .andExpect(jsonPath("$.data.resolvedBy").value(id.toString()));
        verify(completion).resolve(eq(9L), eq(request), eq(id));
    }

    @ParameterizedTest
    @MethodSource("invalidResolutionBodies")
    void invalidResolutionBodiesAreRejectedBeforeService(String body) throws Exception {
        as(Role.ADMIN);
        mvc.perform(patch("/admin/booking-disputes/9/resolution").header("Authorization", "Bearer test-token")
                .contentType("application/json").content(body))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(completion);
    }

    static Stream<String> invalidResolutionBodies() {
        return Stream.of(
                "{\"note\":\"Conclusion\"}",
                "{\"outcome\":null,\"note\":\"Conclusion\"}",
                "{\"outcome\":\"UPHELD\"}",
                "{\"outcome\":\"UPHELD\",\"note\":\"  \"}",
                "{\"outcome\":\"UPHELD\",\"note\":\"" + "x".repeat(2001) + "\"}",
                "{\"outcome\":\"WRONG\",\"note\":\"Conclusion\"}",
                "{");
    }

    private BookingCompletionDisputeResponse privateCase() {
        return BookingCompletionDisputeResponse.builder()
                .id(9L).bookingId(7L).status(BookingCompletionDisputeStatus.OPEN)
                .customerPhone("0901234567").customerEmail("customer@example.test")
                .ownerPhone("0912345678").ownerEmail("owner@example.test")
                .salonPhone("02812345678").salonEmail("salon@example.test").salonAddress("12 Test Street")
                .build();
    }

    private void as(Role role) {
        when(jwtDecoder.decode("test-token")).thenReturn(Jwt.withTokenValue("test-token")
                .header("alg", "RS256").subject(id.toString()).build());
        when(users.findById(id)).thenReturn(Optional.of(User.builder()
                .id(id).role(role).enabled(true).locked(false).build()));
    }
}
