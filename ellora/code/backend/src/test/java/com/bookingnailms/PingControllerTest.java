package com.bookingnailms;

import com.bookingnailms.config.SecurityConfig;
import com.bookingnailms.controller.PingController;
import com.bookingnailms.repository.UserRepository;
import com.bookingnailms.service.SessionRevocationService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.web.servlet.MockMvc;

import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(PingController.class)
@Import(SecurityConfig.class)
class PingControllerTest {
    @Autowired MockMvc mvc;
    @MockBean JwtDecoder jwtDecoder;
    @MockBean UserRepository users;
    @MockBean SessionRevocationService revokedTokens;

    @Test void anonymousPingDoesNotAccessDatabaseOrAuthentication() throws Exception {
        mvc.perform(get("/api/ping").contextPath("/api"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("pong"));
        verifyNoInteractions(users, jwtDecoder, revokedTokens);
    }

    @Test void otherRoutesStillRequireAuthentication() throws Exception {
        mvc.perform(get("/api/profiles/me").contextPath("/api"))
                .andExpect(status().isUnauthorized());
    }
}
