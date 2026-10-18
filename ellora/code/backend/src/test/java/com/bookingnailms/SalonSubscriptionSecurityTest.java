package com.bookingnailms;

import com.bookingnailms.config.SecurityConfig;
import com.bookingnailms.controller.salon.SalonSubscriptionController;
import com.bookingnailms.dto.common.PageResponse;
import com.bookingnailms.dto.subscription.SubscriptionDtos.*;
import com.bookingnailms.entity.User;
import com.bookingnailms.enums.*;
import com.bookingnailms.repository.UserRepository;
import com.bookingnailms.service.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.web.servlet.MockMvc;
import java.math.BigDecimal;
import java.util.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(SalonSubscriptionController.class) @Import(SecurityConfig.class)
class SalonSubscriptionSecurityTest {
    @Autowired MockMvc mvc;
    @MockBean SalonSubscriptionService service;
    @MockBean JwtDecoder decoder;
    @MockBean UserRepository users;
    @MockBean SessionRevocationService revoked;
    private final UUID id = UUID.randomUUID();

    @BeforeEach void catalog() { when(service.catalog()).thenReturn(List.of(new Plan(SubscriptionTier.STANDARD,"Thường","Shop yêu thích",null,"VND",false,1,false),
            new Plan(SubscriptionTier.VIP,"VIP","Shop đối tác",null,"VND",false,1,false))); }
    private void as(Role role) {
        when(decoder.decode("test-token")).thenReturn(Jwt.withTokenValue("test-token").header("alg","RS256").subject(id.toString()).build());
        when(users.findById(id)).thenReturn(Optional.of(User.builder().id(id).role(role).enabled(true).build()));
    }
    @Test void onlyGetCatalogIsPublicAndNoPrivateSubscriptionStateIsExposed() throws Exception {
        mvc.perform(get("/salon-plans")).andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].monthlyPrice").isEmpty()).andExpect(jsonPath("$.data[1].badgeLabel").value("Shop đối tác"));
        mvc.perform(post("/salon-plans")).andExpect(status().isUnauthorized());
        mvc.perform(get("/owner/subscription")).andExpect(status().isUnauthorized());
        mvc.perform(get("/admin/subscription-plans")).andExpect(status().isUnauthorized());
    }
    @Test void rolesCannotCrossOwnerAdminBoundaries() throws Exception {
        for (var role : Role.values()) {
            as(role);
            mvc.perform(get("/owner/subscription").header("Authorization","Bearer test-token"))
                    .andExpect(role==Role.SALON_OWNER ? status().isOk() : status().isForbidden());
            mvc.perform(get("/admin/subscription-plans").header("Authorization","Bearer test-token"))
                    .andExpect(role==Role.ADMIN ? status().isOk() : status().isForbidden());
        }
    }
    @Test void ownerIdentityComesFromJwtAndClientCannotActivateOrChooseAnotherSalon() throws Exception {
        as(Role.SALON_OWNER);
        mvc.perform(post("/owner/subscription/requests").header("Authorization","Bearer test-token").contentType("application/json")
                .content("{\"tier\":\"VIP\",\"expectedPrice\":1,\"salonId\":999,\"status\":\"APPROVED\",\"startsAt\":\"2030-01-01\"}"))
                .andExpect(status().isOk());
        verify(service).create(eq(id),eq(new Create(SubscriptionTier.VIP,BigDecimal.ONE)));
        mvc.perform(patch("/admin/subscription-requests/9").header("Authorization","Bearer test-token").contentType("application/json")
                .content("{\"status\":\"APPROVED\"}")).andExpect(status().isForbidden());
        verify(service,never()).decide(any(),any(),any());
    }
    @ParameterizedTest @ValueSource(strings = {"{}", "{\"tier\":\"NONE\",\"expectedPrice\":1}", "{\"tier\":\"VIP\"}",
            "{\"tier\":\"VIP\",\"expectedPrice\":0}", "{\"tier\":\"VIP\",\"expectedPrice\":-1}", "{\"tier\":\"VIP\",\"expectedPrice\":1.5}",
            "{\"tier\":\"VIP\",\"expectedPrice\":1000000000000000}"})
    void invalidOwnerPricesAndTiersAre400(String body) throws Exception {
        as(Role.SALON_OWNER);
        mvc.perform(post("/owner/subscription/requests").header("Authorization","Bearer test-token").contentType("application/json").content(body)).andExpect(status().isBadRequest());
        verify(service,never()).create(any(),any());
    }
    @Test void adminCanConfigurePositiveAndDisabledNullButInvalidValuesAndDecisionsAre400() throws Exception {
        as(Role.ADMIN);
        mvc.perform(put("/admin/subscription-plans/STANDARD").header("Authorization","Bearer test-token").contentType("application/json")
                .content("{\"monthlyPrice\":1,\"enabled\":true}")).andExpect(status().isOk());
        mvc.perform(put("/admin/subscription-plans/VIP").header("Authorization","Bearer test-token").contentType("application/json")
                .content("{\"monthlyPrice\":null,\"enabled\":false}")).andExpect(status().isOk());
        for (String body : List.of("{}","{\"enabled\":null}","{\"monthlyPrice\":0,\"enabled\":true}","{\"monthlyPrice\":-1,\"enabled\":true}","{\"monthlyPrice\":0.5,\"enabled\":true}")) {
            mvc.perform(put("/admin/subscription-plans/VIP").header("Authorization","Bearer test-token").contentType("application/json").content(body)).andExpect(status().isBadRequest());
        }
        for (String body : List.of("{}","{\"status\":\"PENDING\"}","{\"status\":\"OTHER\"}")) {
            mvc.perform(patch("/admin/subscription-requests/9").header("Authorization","Bearer test-token").contentType("application/json").content(body)).andExpect(status().isBadRequest());
        }
        verify(service,never()).decide(any(),any(),any());
    }
    @Test void paginationClampsSizeAndRejectsHugeOffsetsOrUnknownStatus() throws Exception {
        as(Role.ADMIN);
        mvc.perform(get("/admin/subscription-requests").param("page","-2").param("size","999").header("Authorization","Bearer test-token")).andExpect(status().isOk());
        verify(service).adminHistory(isNull(),argThat(p -> p.getPageNumber()==0 && p.getPageSize()==50));
        mvc.perform(get("/admin/subscription-requests").param("page","2147483647").param("size","50").header("Authorization","Bearer test-token")).andExpect(status().isBadRequest());
        mvc.perform(get("/admin/subscription-requests").param("status","OTHER").header("Authorization","Bearer test-token")).andExpect(status().isBadRequest());
    }

    @Test void onlyOwnerCanPrepareAndReportUsingServerIdentityAndAllowedReference() throws Exception {
        mvc.perform(post("/owner/subscription/requests/9/payment").contentType("application/json").content("{}"))
                .andExpect(status().isUnauthorized());
        for (Role role : List.of(Role.CUSTOMER,Role.ADMIN)) {
            as(role);
            mvc.perform(post("/owner/subscription/requests/9/prepare-payment").header("Authorization","Bearer test-token")).andExpect(status().isForbidden());
            mvc.perform(post("/owner/subscription/requests/9/payment").header("Authorization","Bearer test-token").contentType("application/json").content("{}"))
                    .andExpect(status().isForbidden());
        }
        as(Role.SALON_OWNER);
        mvc.perform(post("/owner/subscription/requests/9/prepare-payment").header("Authorization","Bearer test-token")).andExpect(status().isOk());
        mvc.perform(post("/owner/subscription/requests/9/payment").header("Authorization","Bearer test-token").contentType("application/json")
                .content("{\"reference\":\"TX123\",\"salonId\":999,\"paymentConfirmedAt\":\"2030-01-01\",\"status\":\"APPROVED\",\"receivedAmount\":100}"))
                .andExpect(status().isOk());
        verify(service).preparePayment(id,9L);verify(service).reportPayment(id,9L,new PaymentReport("TX123"));
        mvc.perform(post("/owner/subscription/requests/9/payment").header("Authorization","Bearer test-token").contentType("application/json")
                .content("{\"reference\":\""+"x".repeat(101)+"\"}")).andExpect(status().isBadRequest());
        verify(service,times(1)).reportPayment(any(),any(),any());
    }

    @Test void adminReceiptAmountRejectsNonPositiveFractionalAndOversizedInput() throws Exception {
        as(Role.ADMIN);
        for (String amount : List.of("0","-1","1.5","1000000000000000")) {
            mvc.perform(patch("/admin/subscription-requests/9").header("Authorization","Bearer test-token").contentType("application/json")
                    .content("{\"status\":\"APPROVED\",\"paymentReceived\":true,\"expectedAmount\":"+amount+"}"))
                    .andExpect(status().isBadRequest());
        }
        verify(service,never()).decide(any(),any(),any());
    }
}
