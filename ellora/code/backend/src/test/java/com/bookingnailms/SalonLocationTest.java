package com.bookingnailms;

import com.bookingnailms.dto.salon.SalonRequest;
import com.bookingnailms.entity.*;
import com.bookingnailms.entity.SalonProfileChange.Kind;
import com.bookingnailms.entity.SalonProfileChange.Status;
import com.bookingnailms.enums.Role;
import com.bookingnailms.enums.SalonStatus;
import com.bookingnailms.exception.BadRequestException;
import com.bookingnailms.exception.ResourceNotFoundException;
import com.bookingnailms.repository.*;
import com.bookingnailms.service.SalonProfileChangeService;
import com.bookingnailms.service.SalonService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SalonLocationTest {
    private static final ValidatorFactory VALIDATORS = Validation.buildDefaultValidatorFactory();
    private final SalonRepository salons = mock(SalonRepository.class);
    private final SalonProfileChangeRepository changes = mock(SalonProfileChangeRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final EntityManager entityManager = mock(EntityManager.class);
    private final SalonProfileChangeService service = new SalonProfileChangeService(salons, changes, entityManager);
    private final UUID ownerId = UUID.randomUUID(), adminId = UUID.randomUUID();
    private final User owner = User.builder().id(ownerId).role(Role.CUSTOMER).enabled(true).locked(false).build();
    private final Salon salon = Salon.builder().id(42L).name("Ellora Nail").description("Giới thiệu")
            .address("12 Đường Hoa").city("HCM").district("Quận 1").phone("0901234567")
            .email("salon@example.test").latitude(10.7).longitude(106.6).status(SalonStatus.ACTIVE)
            .owner(owner).logoUrl("old-cover").build();

    SalonLocationTest() {
        when(salons.findByOwnerId(ownerId)).thenReturn(Optional.of(salon));
        when(salons.findForUpdateById(42L)).thenReturn(Optional.of(salon));
        when(users.findForUpdateById(ownerId)).thenReturn(Optional.of(owner));
        when(changes.save(any())).thenAnswer(call -> {
            SalonProfileChange change = call.getArgument(0);
            change.setId(1L);
            when(changes.findById(1L)).thenReturn(Optional.of(change));
            when(changes.findFirstBySalonIdOrderByIdDesc(42L)).thenReturn(Optional.of(change));
            return change;
        });
    }

    @AfterAll static void closeValidators() { VALIDATORS.close(); }

    private SalonRequest request(Double latitude, Double longitude) {
        return new SalonRequest(salon.getName(), salon.getDescription(), salon.getAddress(), salon.getCity(),
                salon.getDistrict(), salon.getPhone(), salon.getEmail(), latitude, longitude);
    }

    @Test void coordinateOnlyChangeWaitsForApprovalAndAppearsInCurrentAndProposedSnapshots() {
        var response = service.submit(ownerId, request(10.75, 106.65));
        assertEquals(Status.PENDING, response.status());
        assertEquals(10.7, response.current().getLatitude());
        assertEquals(106.6, response.current().getLongitude());
        assertEquals(10.75, response.proposed().getLatitude());
        assertEquals(106.65, response.proposed().getLongitude());
        assertEquals(10.7, salon.getLatitude());
        assertEquals(106.6, salon.getLongitude());
        verify(salons, never()).save(any());

        service.review(1L, true, adminId);
        assertEquals(10.75, salon.getLatitude());
        assertEquals(106.65, salon.getLongitude());
        assertEquals("Ellora Nail", salon.getName());
        assertEquals(SalonStatus.ACTIVE, salon.getStatus());
        assertEquals(ownerId, salon.getOwner().getId());
        assertEquals(Status.APPROVED, service.latest(ownerId).status());
    }

    @Test void rejectionKeepsTheApprovedPin() {
        service.submit(ownerId, request(11.0, 107.0));
        service.review(1L, false, adminId);
        assertEquals(10.7, salon.getLatitude());
        assertEquals(106.6, salon.getLongitude());
        assertEquals(Status.REJECTED, service.latest(ownerId).status());
        verify(salons, never()).save(any());
    }

    @Test void omittedCoordinatesPreserveThePinAndDoNotCreateAnEmptyChange() {
        SalonRequest omitted = request(null, null);
        var failure = assertThrows(ResponseStatusException.class, () -> service.submit(ownerId, omitted));
        assertEquals(HttpStatus.BAD_REQUEST, failure.getStatusCode());
        verify(changes, never()).save(any());

        omitted.setName("Ellora mới");
        var response = service.submit(ownerId, omitted);
        assertEquals(10.7, response.proposed().getLatitude());
        assertEquals(106.6, response.proposed().getLongitude());
        service.review(1L, true, adminId);
        assertEquals("Ellora mới", salon.getName());
        assertEquals(10.7, salon.getLatitude());
        assertEquals(106.6, salon.getLongitude());
    }

    @Test void legacyPendingJsonWithoutCoordinateFieldsNeverErasesTheCurrentPin() throws Exception {
        SalonRequest legacy = new ObjectMapper().readValue("""
                {"name":"Tên được duyệt","description":"Giới thiệu","address":"Địa chỉ mới",
                 "city":"HCM","district":"Quận 1","phone":"0901234567","email":"salon@example.test"}
                """, SalonRequest.class);
        assertNull(legacy.getLatitude());
        assertNull(legacy.getLongitude());
        SalonProfileChange pending = new SalonProfileChange();
        pending.setId(99L); pending.setSalon(salon); pending.setProposed(legacy);
        when(changes.findById(99L)).thenReturn(Optional.of(pending));
        service.review(99L, true, adminId);
        assertEquals("Tên được duyệt", salon.getName());
        assertEquals(10.7, salon.getLatitude());
        assertEquals(106.6, salon.getLongitude());
    }

    @Test void photoApprovalRetainsLocationAndIncludesItInTheSnapshot() {
        service.submitPhoto(salon, Kind.COVER, "new-cover", List.of());
        assertEquals(10.7, service.latest(ownerId).proposed().getLatitude());
        service.review(1L, true, adminId);
        assertEquals("new-cover", salon.getLogoUrl());
        assertEquals(10.7, salon.getLatitude());
        assertEquals(106.6, salon.getLongitude());
    }

    @Test void coordinateValidationHelperDoesNotBecomePartOfJsonAndTheOldConstructorStillWorks() throws Exception {
        SalonRequest legacy = new SalonRequest("Tiệm", "", "Địa chỉ", "HCM", "Quận 1", "", "");
        assertTrue(legacy.isCoordinatesValid());
        assertNull(legacy.getLatitude());
        var json = new ObjectMapper();
        SalonRequest complete = request(10.75, 106.65);
        String encoded = json.writeValueAsString(complete);
        assertFalse(encoded.contains("coordinatesValid"));
        assertEquals(10.75, json.readTree(encoded).path("latitude").asDouble());
        assertEquals(complete, json.readValue(encoded, SalonRequest.class));
    }

    static Stream<Arguments> invalidCoordinates() {
        return Stream.of(Arguments.of(null, 106.6), Arguments.of(10.7, null),
                Arguments.of(-90.1, 106.6), Arguments.of(90.1, 106.6),
                Arguments.of(10.7, -180.1), Arguments.of(10.7, 180.1),
                Arguments.of(Double.NaN, 106.6), Arguments.of(10.7, Double.NaN),
                Arguments.of(Double.POSITIVE_INFINITY, 106.6), Arguments.of(10.7, Double.NEGATIVE_INFINITY));
    }

    @ParameterizedTest @MethodSource("invalidCoordinates")
    void invalidPairsRangesAndNonFiniteNumbersCannotBeSubmittedOrRegistered(Double latitude, Double longitude) {
        var request = request(latitude, longitude);
        assertFalse(VALIDATORS.getValidator().validate(request).isEmpty());
        assertThrows(BadRequestException.class, () -> service.submit(ownerId, request));
        assertThrows(BadRequestException.class, () -> new SalonService(salons, users).createSalon(request, ownerId));
        verifyNoInteractions(changes, entityManager);
        verify(salons, never()).save(any());
    }

    static Stream<Arguments> validCoordinates() {
        return Stream.of(Arguments.of(null, null), Arguments.of(-90.0, -180.0),
                Arguments.of(90.0, 180.0), Arguments.of(0.0, 0.0));
    }

    @ParameterizedTest @MethodSource("validCoordinates")
    void optionalCoordinatesAndGeographicBoundariesAreValid(Double latitude, Double longitude) {
        assertTrue(VALIDATORS.getValidator().validate(request(latitude, longitude)).isEmpty());
    }

    @Test void registrationSavesAValidPinButStillWaitsForAdminApproval() {
        when(salons.save(any())).thenAnswer(call -> {
            Salon created = call.getArgument(0); created.setId(43L); return created;
        });
        var response = new SalonService(salons, users).createSalon(request(10.75, 106.65), ownerId);
        assertEquals(10.75, response.getLatitude());
        assertEquals(106.65, response.getLongitude());
        assertEquals(SalonStatus.PENDING_APPROVAL, response.getStatus());
        assertEquals(ownerId, response.getOwnerId());
    }

    @Test void ownerWithoutASalonCannotSubmitLocationForAnotherBusiness() {
        assertThrows(ResourceNotFoundException.class,
                () -> service.submit(UUID.randomUUID(), request(10.75, 106.65)));
        verifyNoInteractions(changes, entityManager);
        assertEquals(10.7, salon.getLatitude());
    }
}
