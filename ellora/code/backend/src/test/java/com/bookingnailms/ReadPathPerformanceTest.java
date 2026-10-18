package com.bookingnailms;

import com.bookingnailms.controller.owner.OwnerController;
import com.bookingnailms.controller.salon.PublicSalonController;
import com.bookingnailms.dto.employee.EmployeeResponse;
import com.bookingnailms.entity.*;
import com.bookingnailms.enums.SalonStatus;
import com.bookingnailms.exception.ResourceNotFoundException;
import com.bookingnailms.repository.*;
import com.bookingnailms.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.*;
import org.springframework.security.oauth2.jwt.Jwt;
import java.time.LocalDate;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ReadPathPerformanceTest {
    @Test void activeGateAndOwnerIdentityReadScalarsWithoutLoadingSalonCollections() {
        var repo=mock(SalonRepository.class);var service=new SalonService(repo,mock(UserRepository.class));
        UUID owner=UUID.randomUUID();
        when(repo.existsByIdAndStatus(42L,SalonStatus.ACTIVE)).thenReturn(true);
        when(repo.findIdByOwnerId(owner)).thenReturn(Optional.of(42L));
        service.requireActiveSalon(42L);assertEquals(42L,service.getMySalonId(owner));
        assertThrows(ResourceNotFoundException.class,()->service.requireActiveSalon(999L));
        assertThrows(ResourceNotFoundException.class,()->service.getMySalonId(UUID.randomUUID()));
        verify(repo,never()).findById(any());verify(repo,never()).findByOwnerId(any());
    }

    @Test void nestedPublicReadsUseActiveGateAndStillStripEmployeePhoneNumbers() {
        var salons=mock(SalonService.class);var services=mock(NailServiceService.class);var employees=mock(EmployeeService.class);
        var reviews=mock(ReviewService.class);var hours=mock(SalonWorkingHourService.class);
        var controller=new PublicSalonController(salons,services,employees,reviews,hours);
        when(employees.getSalonEmployees(42L)).thenReturn(List.of(EmployeeResponse.builder().id(3L).fullName("Nhân viên")
                .phone("0901234567").avatarUrl("https://example.test/avatar.png").bio("Nail").active(true).build()));
        controller.services(42L);controller.workingHours(42L);controller.closures(42L,LocalDate.of(2026,10,18),LocalDate.of(2026,10,25));
        controller.reviews(42L,2);var employee=controller.employees(42L).getData().get(0);
        assertEquals("Nhân viên",employee.getFullName());assertEquals("https://example.test/avatar.png",employee.getAvatarUrl());assertNull(employee.getPhone());
        verify(salons,times(5)).requireActiveSalon(42L);verify(salons,never()).getSalonById(any());
        verify(reviews).getSalonReviews(42L,PageRequest.of(2,20));
    }

    @Test void blockedOrMissingPublicSalonCannotExposeAnyNestedResource() {
        var salons=mock(SalonService.class);var services=mock(NailServiceService.class);var employees=mock(EmployeeService.class);
        var reviews=mock(ReviewService.class);var hours=mock(SalonWorkingHourService.class);
        var controller=new PublicSalonController(salons,services,employees,reviews,hours);
        doThrow(new ResourceNotFoundException("Salon not found")).when(salons).requireActiveSalon(42L);
        assertThrows(ResourceNotFoundException.class,()->controller.services(42L));
        assertThrows(ResourceNotFoundException.class,()->controller.employees(42L));
        assertThrows(ResourceNotFoundException.class,()->controller.reviews(42L,0));
        assertThrows(ResourceNotFoundException.class,()->controller.workingHours(42L));
        assertThrows(ResourceNotFoundException.class,()->controller.closures(42L,LocalDate.now(),LocalDate.now().plusDays(1)));
        verifyNoInteractions(services,employees,reviews,hours);
    }

    @Test void ownerReadRoutesResolveOnlyTheAuthenticatedOwnersSalonId() {
        var salons=mock(SalonService.class);var services=mock(NailServiceService.class);var employees=mock(EmployeeService.class);
        var reviews=mock(ReviewService.class);var hours=mock(SalonWorkingHourService.class);
        var controller=new OwnerController(salons,mock(SalonProfileChangeService.class),services,employees,reviews,mock(OwnerDashboardService.class),hours);
        UUID owner=UUID.randomUUID();var jwt=Jwt.withTokenValue("test").header("alg","RS256").subject(owner.toString()).build();
        when(salons.getMySalonId(owner)).thenReturn(42L);
        controller.services(jwt);controller.employees(jwt);controller.workingHours(jwt);controller.reviews(jwt,-2);
        verify(salons,times(4)).getMySalonId(owner);verify(salons,never()).getMySalon(any());
        verify(services).getServicesBySalon(42L);verify(employees).getSalonEmployees(42L);verify(hours).get(42L);
        verify(reviews).getSalonReviews(42L,PageRequest.of(0,20));
    }

    @Test void reviewReadGraphPreservesExactPageAndOptionalEmployeeFields() {
        var reviews=mock(ReviewRepository.class);var salons=mock(SalonRepository.class);
        var service=new ReviewService(reviews,mock(BookingRepository.class),mock(UserRepository.class),salons);
        var customer=User.builder().fullName("Khách thử").build();
        var employee=Employee.builder().fullName("Thợ thử").avatarUrl("https://example.test/staff.png").build();
        var first=Review.builder().id(1L).customer(customer).booking(Booking.builder().employee(employee).build()).rating(5).comment("Tốt").build();
        var second=Review.builder().id(2L).customer(customer).rating(4).build();
        var page=PageRequest.of(2,20);when(salons.existsById(42L)).thenReturn(true);
        when(reviews.findWithDetailsBySalonIdOrderByCreatedAtDesc(42L,page)).thenReturn(new PageImpl<>(List.of(first,second),page,61));
        var result=service.getSalonReviews(42L,page);
        assertEquals(2,result.getPageNumber());assertEquals(61,result.getTotalElements());assertFalse(result.isLast());
        assertEquals(List.of(1L,2L),result.getContent().stream().map(r->r.getId()).toList());
        assertEquals("Khách thử",result.getContent().get(0).getCustomerName());assertEquals("Thợ thử",result.getContent().get(0).getEmployeeName());
        assertEquals("https://example.test/staff.png",result.getContent().get(0).getEmployeeAvatarUrl());assertNull(result.getContent().get(1).getEmployeeName());
        verify(reviews,never()).findBySalonIdOrderByCreatedAtDesc(any(),any());verify(reviews,never()).save(any());
    }
}
