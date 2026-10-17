package com.bookingnailms;
import com.bookingnailms.controller.salon.PublicSalonController;
import com.bookingnailms.dto.salon.SalonResponse;
import com.bookingnailms.dto.salon.SalonSummaryResponse;
import com.bookingnailms.entity.*;
import com.bookingnailms.enums.SalonStatus;
import com.bookingnailms.exception.ResourceNotFoundException;
import com.bookingnailms.repository.*;
import com.bookingnailms.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class PublicSalonTest {
 @Test void listQueriesOnlyApprovedSalonsAndMapsDatabaseIds() {
  var repo=mock(SalonRepository.class);var service=new SalonService(repo,mock(UserRepository.class));
  var page=PageRequest.of(0,12);var salon=SalonSummaryResponse.builder().id(42L).name("Salon thật").build();
  when(repo.searchPublic(any(),any(),eq(page))).thenReturn(new PageImpl<>(List.of(salon)));
  assertEquals(42L,service.searchSalons("",page).getContent().get(0).getId());
  when(repo.searchPublic(argThat(filters -> filters.keyword().equals("Hồ Chí Minh")),any(),eq(page))).thenReturn(Page.empty(page));
  assertTrue(service.searchSalons(" Hồ Chí Minh ",page).getContent().isEmpty());
 }
 @Test void unpublishedSalonCannotExposeDetailsServicesEmployeesOrReviews() {
  var salons=mock(SalonService.class);var services=mock(NailServiceService.class);var employees=mock(EmployeeService.class);var reviews=mock(ReviewService.class);
  var controller=new PublicSalonController(salons,services,employees,reviews,mock(SalonWorkingHourService.class));
  for(var status:List.of(SalonStatus.PENDING_APPROVAL,SalonStatus.REJECTED,SalonStatus.SUSPENDED)) {
   when(salons.getSalonById(42L)).thenReturn(SalonResponse.builder().id(42L).status(status).build());
   assertThrows(ResourceNotFoundException.class,()->controller.detail(42L));
   assertThrows(ResourceNotFoundException.class,()->controller.services(42L));
   assertThrows(ResourceNotFoundException.class,()->controller.employees(42L));
   assertThrows(ResourceNotFoundException.class,()->controller.reviews(42L,0));
  }
  verifyNoInteractions(services,employees,reviews);
 }
}
