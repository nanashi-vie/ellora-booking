package com.bookingnailms;

import com.bookingnailms.config.SecurityConfig;
import com.bookingnailms.controller.*;
import com.bookingnailms.repository.UserRepository;
import com.bookingnailms.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest({PingController.class,DatabasePingController.class}) @Import(SecurityConfig.class)
class DatabasePingControllerTest {
    @Autowired MockMvc mvc;
    @MockBean DatabasePingService database;
    @MockBean JwtDecoder decoder;
    @MockBean UserRepository users;
    @MockBean SessionRevocationService revoked;

    @Test void exactAnonymousGetReturnsReadinessAndNoStoreWithoutAuthenticationDatabaseWork() throws Exception {
        when(database.check()).thenReturn(new DatabasePingService.Result("UP",12));
        mvc.perform(get("/api/ping/db").contextPath("/api")).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.status").value("UP")).andExpect(jsonPath("$.data.latencyMs").value(12));
        verify(database).check();verifyNoInteractions(decoder,users,revoked);
    }
    @Test void failureOrBusyProbeIsGeneric503AndNeverCacheable() throws Exception {
        when(database.check()).thenReturn(new DatabasePingService.Result("DOWN",3000));
        mvc.perform(get("/api/ping/db").contextPath("/api")).andExpect(status().isServiceUnavailable())
                .andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Database unavailable")).andExpect(jsonPath("$.data.status").value("DOWN"))
                .andExpect(jsonPath("$.error").doesNotExist());
        verifyNoInteractions(decoder,users,revoked);
    }
    @Test void existingLivenessNeverInvokesReadinessService() throws Exception {
        mvc.perform(get("/api/ping").contextPath("/api")).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control","no-store")).andExpect(jsonPath("$.message").value("pong"));
        verifyNoInteractions(database,decoder,users,revoked);
    }
    @Test void otherMethodsNestedPathsAndProtectedRoutesRemainProtected() throws Exception {
        mvc.perform(post("/api/ping/db").contextPath("/api")).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/ping/db").contextPath("/api")).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/ping/db").contextPath("/api")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/ping/db/other").contextPath("/api")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/profiles/me").contextPath("/api")).andExpect(status().isUnauthorized());
        verifyNoInteractions(database,decoder,users,revoked);
    }
}
