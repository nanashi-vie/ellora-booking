package com.bookingnailms;

import com.bookingnailms.dto.salon.SalonSearchRequest;
import com.bookingnailms.exception.BadRequestException;
import com.bookingnailms.repository.SalonRepository;
import com.bookingnailms.repository.UserRepository;
import com.bookingnailms.service.SalonService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;

import java.time.*;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PublicSearchValidationTest {
    private final SalonRepository repo = mock(SalonRepository.class);
    private final PageRequest page = PageRequest.of(0, 12);
    private final Clock clock = Clock.fixed(Instant.parse("2026-10-18T03:00:20Z"), ZoneOffset.UTC);
    private final SalonService service = new SalonService(repo, mock(UserRepository.class), clock);
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 18);

    @Test void normalizesTextAndPassesVietnamCutoffAndPaginationToOneRepositoryQuery() {
        when(repo.searchPublic(any(), any(), any(), eq(page))).thenReturn(Page.empty(page));
        service.searchSalons(request("  Sơn gel  ", "  Quận 9  ", TODAY, null, 0.0, 0.0, 5.0, "distance"), page);
        verify(repo).searchPublic(eq(request("Sơn gel", "Quận 9", TODAY, null, 0.0, 0.0, 5.0, "distance")),
                eq(TODAY.atTime(11, 1)), eq(TODAY.atTime(10,0,20)), eq(page));
        verifyNoMoreInteractions(repo);
    }

    @ParameterizedTest @MethodSource("invalidCoordinates")
    void rejectsIncompleteNonFiniteAndOutOfRangeCoordinates(Double latitude, Double longitude) {
        assertThrows(BadRequestException.class,
                () -> service.searchSalons(request(null, null, null, null, latitude, longitude, null, null), page));
        verifyNoInteractions(repo);
    }
    static Stream<Double[]> invalidCoordinates() {
        return Stream.of(new Double[]{10.0, null}, new Double[]{null, 106.0}, new Double[]{91.0, 0.0},
                new Double[]{0.0, -181.0}, new Double[]{Double.NaN, 0.0}, new Double[]{0.0, Double.NaN},
                new Double[]{Double.POSITIVE_INFINITY, 0.0}, new Double[]{0.0, Double.NEGATIVE_INFINITY});
    }

    @ParameterizedTest @MethodSource("invalidRadius")
    void rejectsRadiusWithoutCenterAndOutsideFinitePositiveLimit(Double radius) {
        assertThrows(BadRequestException.class,
                () -> service.searchSalons(request(null, null, null, null, 0.0, 0.0, radius, null), page));
        verifyNoInteractions(repo);
    }
    static Stream<Double> invalidRadius() { return Stream.of(0.0, -1.0, 100.01, Double.NaN, Double.POSITIVE_INFINITY); }

    @Test void radiusAndDistanceSortingRequireACenter() {
        assertThrows(BadRequestException.class, () -> service.searchSalons(request(null,null,null,null,null,null,5.0,null),page));
        assertThrows(BadRequestException.class, () -> service.searchSalons(request(null,null,null,null,null,null,null,"distance"),page));
        assertThrows(BadRequestException.class, () -> service.searchSalons(request(null,null,null,null,null,null,null,"recommended"),page));
        verifyNoInteractions(repo);
    }

    @Test void validatesDateRangeAndTimeMinutePrecision() {
        for (LocalDate date : new LocalDate[]{TODAY.minusDays(1), TODAY.plusYears(1).plusDays(1)}) {
            assertThrows(BadRequestException.class, () -> service.searchSalons(request(null,null,date,null,null,null,null,null),page));
        }
        for (LocalTime time : new LocalTime[]{LocalTime.of(11, 0), LocalTime.of(12, 0, 1), LocalTime.of(12,0,0,1)}) {
            assertThrows(BadRequestException.class, () -> service.searchSalons(request(null,null,TODAY,time,null,null,null,null),page));
        }
        assertThrows(BadRequestException.class, () -> service.searchSalons(request(null,null,null,LocalTime.NOON,null,null,null,null),page));
        verifyNoInteractions(repo);
    }

    @Test void acceptsFirstWholeMinuteAndInclusiveCoordinateRadiusAndDateBounds() {
        when(repo.searchPublic(any(), any(), any(), eq(page))).thenReturn(Page.empty(page));
        service.searchSalons(request(null,null,TODAY,LocalTime.of(11,1),-90.0,180.0,100.0,"rating"),page);
        service.searchSalons(request(null,null,TODAY.plusYears(1),LocalTime.NOON,90.0,-180.0,null,null),page);
        verify(repo, times(2)).searchPublic(any(), any(), any(), eq(page));
    }

    @Test void exactOneHourBoundaryAcrossVietnamMidnightIsAccepted() {
        var lateClock = Clock.fixed(Instant.parse("2026-10-18T16:30:00Z"), ZoneOffset.UTC);
        var lateService = new SalonService(repo, mock(UserRepository.class), lateClock);
        when(repo.searchPublic(any(), any(), any(), eq(page))).thenReturn(Page.empty(page));
        assertThrows(BadRequestException.class, () -> lateService.searchSalons(request(null,null,TODAY.plusDays(1),LocalTime.of(0,29),null,null,null,null),page));
        lateService.searchSalons(request(null,null,TODAY.plusDays(1),LocalTime.of(0,30),null,null,null,null),page);
        lateService.searchSalons(request(null,null,TODAY,null,null,null,null,null),page);
        verify(repo,times(2)).searchPublic(any(), eq(TODAY.plusDays(1).atTime(0,30)),eq(TODAY.atTime(23,30)),eq(page));
    }

    @Test void textAndOffsetLimitsAreCheckedBeforeQuerying() {
        assertThrows(BadRequestException.class, () -> service.searchSalons(request("a".repeat(256),null,null,null,null,null,null,null),page));
        assertThrows(BadRequestException.class, () -> service.searchSalons(request(null,"a".repeat(256),null,null,null,null,null,null),page));
        assertThrows(BadRequestException.class, () -> service.searchSalons(request(null,null,null,null,null,null,null,null),PageRequest.of(Integer.MAX_VALUE,50)));
        verifyNoInteractions(repo);
    }

    private static SalonSearchRequest request(String keyword, String location, LocalDate date, LocalTime time,
            Double latitude, Double longitude, Double radius, String sort) {
        return new SalonSearchRequest(keyword, location, date, time, latitude, longitude, radius, sort);
    }
}
