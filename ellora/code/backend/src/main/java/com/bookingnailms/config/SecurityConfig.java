package com.bookingnailms.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import com.bookingnailms.repository.UserRepository;
import com.bookingnailms.service.SessionRevocationService;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import java.util.List;
import java.util.UUID;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtDecoders;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http, UserRepository users,
            SessionRevocationService revokedTokens) throws Exception {
        http
                .cors(org.springframework.security.config.Customizer.withDefaults())
                .headers(headers -> headers
                        .contentTypeOptions(org.springframework.security.config.Customizer.withDefaults())
                        .frameOptions(frame -> frame.deny())
                        .referrerPolicy(referrer -> referrer.policy(
                                org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
                        .addHeaderWriter(new org.springframework.security.web.header.writers.StaticHeadersWriter(
                                "Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()"))
                        .httpStrictTransportSecurity(hsts -> hsts
                                .includeSubDomains(true)
                                .maxAgeInSeconds(31_536_000)))
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/ping", "/ping/db").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/support/contact").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/salon-plans").permitAll()
                        .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                        .requestMatchers("/customer/salons/**").permitAll()
                        .requestMatchers("/auth/forgot-password", "/auth/forgot-password/confirm").permitAll()
                        .requestMatchers("/admin/**").hasRole("ADMIN")
                        .requestMatchers("/owner/**").hasRole("SALON_OWNER")
                        .requestMatchers(org.springframework.http.HttpMethod.POST, "/bookings/guest")
                                .access(new org.springframework.security.web.access.expression.WebExpressionAuthorizationManager(
                                        "isAnonymous() or hasRole('CUSTOMER')"))
                        .requestMatchers("/bookings", "/bookings/**", "/reviews", "/reviews/**").hasRole("CUSTOMER")
                        .requestMatchers(org.springframework.http.HttpMethod.POST, "/business/registration").hasRole("CUSTOMER")
                        .anyRequest().authenticated()
                )
                .oauth2ResourceServer(oauth2 -> oauth2.jwt(jwt -> jwt.jwtAuthenticationConverter(token -> {
                    if (revokedTokens.isRevoked(token.getTokenValue())) {
                        throw new OAuth2AuthenticationException(new OAuth2Error("invalid_token"), "Session ended");
                    }
                    var user = users.findById(UUID.fromString(token.getSubject()));
                    if (user.isPresent() && (!user.get().isEnabled() || user.get().isLocked())) {
                        throw new OAuth2AuthenticationException(new OAuth2Error("invalid_token"), "Account disabled");
                    }
                    var authorities = user.map(value -> List.of(new SimpleGrantedAuthority("ROLE_" + value.getRole().name())))
                            .orElseGet(List::of);
                    return new JwtAuthenticationToken(token, authorities);
                })));

        return http.build();
    }

    @Bean
    public org.springframework.web.cors.CorsConfigurationSource corsConfigurationSource(
            @Value("${app.cors.allowed-origins:http://localhost:4200}") String allowedOrigins) {
        var configuration = new org.springframework.web.cors.CorsConfiguration();
        configuration.setAllowedOrigins(java.util.Arrays.stream(allowedOrigins.split(","))
                .map(String::trim).filter(origin -> !origin.isEmpty()).toList());
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept"));
        configuration.setExposedHeaders(List.of("Location"));
        configuration.setAllowCredentials(false);
        var source = new org.springframework.web.cors.UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    @Bean
    public JwtDecoder jwtDecoder(
            @Value("${app.cognito.issuer-uri}") String issuerUri,
            @Value("${app.cognito.client-id}") String clientId) {
        NimbusJwtDecoder decoder = (NimbusJwtDecoder) JwtDecoders.fromIssuerLocation(issuerUri);

        OAuth2TokenValidator<Jwt> defaults = JwtValidators.createDefaultWithIssuer(issuerUri);
        OAuth2TokenValidator<Jwt> cognitoClaims = token -> {
            boolean accessToken = "access".equals(token.getClaimAsString("token_use"));
            boolean correctClient = clientId.equals(token.getClaimAsString("client_id"));

            if (accessToken && correctClient) {
                return OAuth2TokenValidatorResult.success();
            }

            OAuth2Error error = new OAuth2Error(
                    "invalid_token",
                    "Token must be a Cognito access token for the configured app client",
                    null);
            return OAuth2TokenValidatorResult.failure(error);
        };

        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(defaults, cognitoClaims));
        return decoder;
    }
}
