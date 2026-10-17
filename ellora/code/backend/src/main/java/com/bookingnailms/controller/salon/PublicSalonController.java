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
import org.springframework.format.annotation.DateTimeFormat;
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
            @RequestParam(required = false) String location,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) java.time.LocalDate date,
            @RequestParam(required = false) String time,
            @RequestParam(required = false) Double latitude,
            @RequestParam(required = false) Double longitude,
            @RequestParam(required = false) Double radiusKm,
            @RequestParam(defaultValue = "newest") String sort,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size) {
        if (time != null && !time.isEmpty() && !time.matches("(?:[01]\\d|2[0-3]):[0-5]\\d")) {
            throw new com.bookingnailms.exception.BadRequestException("Giờ tìm kiếm phải có định dạng HH:mm.");
        }
        var selectedTime = time == null || time.isEmpty() ? null : java.time.LocalTime.parse(time);
        var filters = new SalonSearchRequest(keyword, location, date, selectedTime, latitude, longitude, radiusKm, sort);
        return ApiResponse.success(salons.searchSalons(filters,
                PageRequest.of(Math.max(0, page), Math.max(1, Math.min(size, 50)))), null);
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
