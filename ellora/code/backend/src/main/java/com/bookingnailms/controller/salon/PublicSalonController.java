package com.bookingnailms.controller.salon;

import com.bookingnailms.dto.common.*;
import com.bookingnailms.dto.salon.*;
import com.bookingnailms.dto.service.ServiceResponse;
import com.bookingnailms.dto.employee.EmployeeResponse;
import com.bookingnailms.dto.review.ReviewResponse;
import com.bookingnailms.enums.SalonStatus;
import com.bookingnailms.exception.ResourceNotFoundException;
import com.bookingnailms.service.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/customer/salons")
@RequiredArgsConstructor
public class PublicSalonController {
    private final SalonService salons;
    private final NailServiceService services;
    private final EmployeeService employees;
    private final ReviewService reviews;
    private final SalonWorkingHourService workingHours;

    @GetMapping
    public ApiResponse<PageResponse<SalonSummaryResponse>> search(
            @RequestParam(defaultValue = "") String keyword,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size) {
        return ApiResponse.success(salons.searchSalons(keyword, PageRequest.of(Math.max(0, page), Math.max(1, Math.min(size, 50)), Sort.by("id").descending())), null);
    }

    private SalonResponse active(Long id) {
        var salon = salons.getSalonById(id);
        if (salon.getStatus() != SalonStatus.ACTIVE) throw new ResourceNotFoundException("Salon not found");
        return salon;
    }

    @GetMapping("/{id}")
    public ApiResponse<SalonResponse> detail(@PathVariable Long id) { return ApiResponse.success(active(id), null); }

    @GetMapping("/{id}/working-hours")
    public ApiResponse<List<com.bookingnailms.dto.salon.SalonWorkingHourRequest>> workingHours(@PathVariable Long id) {
        active(id);
        return ApiResponse.success(workingHours.get(id), null);
    }

    @GetMapping("/{id}/closures")
    public ApiResponse<List<java.time.LocalDate>> closures(@PathVariable Long id,
            @RequestParam java.time.LocalDate from, @RequestParam java.time.LocalDate to) {
        active(id);
        return ApiResponse.success(workingHours.closedDates(id, from, to), null);
    }

    @GetMapping("/{id}/services")
    public ApiResponse<List<ServiceResponse>> services(@PathVariable Long id) {
        active(id);
        return ApiResponse.success(services.getServicesBySalon(id), null);
    }

    @GetMapping("/{id}/employees")
    public ApiResponse<List<EmployeeResponse>> employees(@PathVariable Long id) {
        active(id);
        // Public booking needs names and avatars, never employees' phone numbers.
        var result = employees.getSalonEmployees(id).stream().map(e -> EmployeeResponse.builder()
                .id(e.getId()).fullName(e.getFullName()).avatarUrl(e.getAvatarUrl()).bio(e.getBio()).active(e.isActive()).build()).toList();
        return ApiResponse.success(result, null);
    }

    @GetMapping("/{id}/reviews")
    public ApiResponse<PageResponse<ReviewResponse>> reviews(@PathVariable Long id, @RequestParam(defaultValue = "0") int page) {
        active(id);
        return ApiResponse.success(reviews.getSalonReviews(id, PageRequest.of(Math.max(0, page), 20)), null);
    }
}
