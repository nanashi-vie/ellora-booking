package com.bookingnailms;

import com.bookingnailms.config.SecurityConfig;
import com.bookingnailms.controller.salon.PublicSalonController;
import com.bookingnailms.dto.salon.SalonSummaryResponse;
import com.bookingnailms.repository.SalonRepository;
import com.bookingnailms.repository.UserRepository;
import com.bookingnailms.service.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageImpl;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(PublicSalonController.class)
@Import({SecurityConfig.class, SalonService.class})
class PublicSearchMvcTest {
    @Autowired MockMvc mvc;
    @MockBean SalonRepository repo;
    @MockBean UserRepository users;
    @MockBean JwtDecoder jwtDecoder;
    @MockBean SessionRevocationService revokedTokens;
    @MockBean NailServiceService services;
    @MockBean EmployeeService employees;
    @MockBean ReviewService reviews;
    @MockBean SalonWorkingHourService workingHours;

    @BeforeEach void pageResult() {
        when(repo.searchPublic(any(), any(), any(), any())).thenAnswer(call -> new PageImpl<>(List.of(
                SalonSummaryResponse.builder().id(7L).name("Tiệm thật").district("Quận 9")
                        .latitude(0.0).longitude(0.0).distanceKm(0.0).build()), call.getArgument(3), 1));
    }

    @Test void anonymousCanSearchWithAllTypedFiltersAndReceiveApprovedMapFields() throws Exception {
        String date = LocalDate.now(ZoneId.of("Asia/Ho_Chi_Minh")).plusDays(1).toString();
        mvc.perform(get("/customer/salons").param("keyword"," Sơn gel ").param("location"," Quận 9 ")
                .param("date",date).param("time","12:30").param("latitude","0").param("longitude","0")
                .param("radiusKm","5").param("sort","distance").param("page","-1").param("size","999"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.content[0].district").value("Quận 9"))
                .andExpect(jsonPath("$.data.content[0].latitude").value(0.0))
                .andExpect(jsonPath("$.data.content[0].longitude").value(0.0))
                .andExpect(jsonPath("$.data.content[0].distanceKm").value(0.0))
                .andExpect(jsonPath("$.data.pageNumber").value(0)).andExpect(jsonPath("$.data.pageSize").value(50));
        verify(repo).searchPublic(argThat(f -> f.keyword().equals("Sơn gel") && f.location().equals("Quận 9")
                && f.date().toString().equals(date) && f.time().toString().equals("12:30") && f.sort().equals("distance")),
                any(), any(), argThat(p -> p.getPageNumber() == 0 && p.getPageSize() == 50));
    }

    @Test void legacyQueryKeepsNewestDefaultsAndClampsSmallPageSize() throws Exception {
        mvc.perform(get("/customer/salons").param("keyword","Nail").param("size","0"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.pageSize").value(1));
        verify(repo).searchPublic(argThat(f -> f.keyword().equals("Nail") && f.location().isEmpty()
                && f.latitude() == null && f.sort().equals("newest")), any(), any(), any());
    }

    @ParameterizedTest
    @ValueSource(strings = {"latitude=NaN&longitude=0", "latitude=91&longitude=0", "latitude=10", "radiusKm=5",
            "sort=distance", "sort=other", "date=bad", "time=12:00", "time=12:00:01", "page=bad"})
    void invalidFiltersReturn400WithoutAQuery(String query) throws Exception {
        mvc.perform(get("/customer/salons?" + query)).andExpect(status().isBadRequest());
        verifyNoInteractions(repo);
    }

    @ParameterizedTest @ValueSource(strings = {"12:00:00", "12:00:01", "24:00", "12:60", "9:00"})
    void timeRequiresTheExactHourMinuteFormatEvenWithAValidFutureDate(String time) throws Exception {
        String tomorrow = LocalDate.now(ZoneId.of("Asia/Ho_Chi_Minh")).plusDays(1).toString();
        mvc.perform(get("/customer/salons").param("date",tomorrow).param("time",time))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(repo);
    }
}
