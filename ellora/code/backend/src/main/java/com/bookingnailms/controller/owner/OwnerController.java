package com.bookingnailms.controller.owner;

import com.bookingnailms.dto.common.*;
import com.bookingnailms.dto.employee.*;
import com.bookingnailms.dto.service.*;
import com.bookingnailms.dto.review.*;
import com.bookingnailms.dto.salon.SalonResponse;
import com.bookingnailms.service.*;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/owner")
@RequiredArgsConstructor
public class OwnerController {
    private final SalonService salons;
    private final SalonProfileChangeService profileChanges;
    private final NailServiceService services;
    private final EmployeeService employees;
    private final ReviewService reviews;
    private final OwnerDashboardService dashboard;
    private final SalonWorkingHourService workingHours;

    @GetMapping("/dashboard")
    public ApiResponse<OwnerDashboardService.Summary> dashboard(@AuthenticationPrincipal Jwt jwt) {
        return ApiResponse.success(dashboard.get(owner(jwt)), null);
    }

    private UUID owner(Jwt jwt) { return UUID.fromString(jwt.getSubject()); }

    @GetMapping("/salon")
    public ApiResponse<SalonResponse> salon(@AuthenticationPrincipal Jwt jwt) {
        return ApiResponse.success(salons.getMySalon(owner(jwt)), null);
    }

    @GetMapping("/salon/working-hours")
    public ApiResponse<List<com.bookingnailms.dto.salon.SalonWorkingHourRequest>> workingHours(@AuthenticationPrincipal Jwt jwt) {
        return ApiResponse.success(workingHours.get(salons.getMySalonId(owner(jwt))), null);
    }

    @PutMapping("/salon/working-hours")
    public ApiResponse<List<com.bookingnailms.dto.salon.SalonWorkingHourRequest>> updateWorkingHours(
            @AuthenticationPrincipal Jwt jwt, @RequestBody List<com.bookingnailms.dto.salon.SalonWorkingHourRequest> request) {
        return ApiResponse.success(workingHours.update(owner(jwt), request), "Đã cập nhật giờ hoạt động của salon.");
    }

    @GetMapping("/salon/closures")
    public ApiResponse<List<com.bookingnailms.dto.salon.SalonClosureResponse>> closures(@AuthenticationPrincipal Jwt jwt) {
        return ApiResponse.success(workingHours.ownerClosures(owner(jwt)), null);
    }

    @PostMapping("/salon/closures")
    public ApiResponse<com.bookingnailms.dto.salon.SalonClosureResponse> closeDate(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody com.bookingnailms.dto.salon.SalonClosureRequest request) {
        return ApiResponse.success(workingHours.closeDate(owner(jwt), request), "Đã lưu ngày nghỉ và từ chối/hủy các lịch hẹn bị ảnh hưởng.");
    }

    @DeleteMapping("/salon/closures/{id}")
    public ApiResponse<Void> reopenDate(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        workingHours.reopenDate(owner(jwt), id);
        return ApiResponse.success(null, "Đã xóa ngày nghỉ. Các lịch đã hủy không được tự khôi phục.");
    }

    @PutMapping("/salon")
    public ApiResponse<com.bookingnailms.dto.salon.SalonProfileChangeResponse> updateSalon(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody com.bookingnailms.dto.salon.SalonRequest request) {
        UUID ownerId = owner(jwt);
        return ApiResponse.success(profileChanges.submit(ownerId, request), "Đã gửi yêu cầu. Thông tin sẽ cập nhật sau khi Admin duyệt.");
    }

    @GetMapping("/salon/change-request")
    public ApiResponse<com.bookingnailms.dto.salon.SalonProfileChangeResponse> profileChange(@AuthenticationPrincipal Jwt jwt) {
        return ApiResponse.success(profileChanges.latest(owner(jwt)), null);
    }

    @GetMapping("/services")
    public ApiResponse<List<ServiceResponse>> services(@AuthenticationPrincipal Jwt jwt) {
        return ApiResponse.success(services.getServicesBySalon(salons.getMySalonId(owner(jwt))), null);
    }

    @PostMapping("/services")
    public ApiResponse<ServiceResponse> addService(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ServiceRequest request) {
        return ApiResponse.success(services.addService(request, salons.getMySalon(owner(jwt)).getId()), null);
    }

    @PutMapping("/services/{id}")
    public ApiResponse<ServiceResponse> updateService(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id, @Valid @RequestBody ServiceRequest request) {
        return ApiResponse.success(services.updateService(id, request, owner(jwt)), null);
    }

    @DeleteMapping("/services/{id}")
    public ApiResponse<Void> removeService(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        services.deleteService(id, owner(jwt));
        return ApiResponse.success(null, null);
    }

    @GetMapping("/employees")
    public ApiResponse<List<EmployeeResponse>> employees(@AuthenticationPrincipal Jwt jwt) {
        return ApiResponse.success(employees.getSalonEmployees(salons.getMySalonId(owner(jwt))), null);
    }

    @GetMapping("/employees/{id}/schedules")
    public ApiResponse<List<EmployeeService.Schedule>> employeeSchedules(@AuthenticationPrincipal Jwt jwt, @PathVariable("id") Long id) {
        return ApiResponse.success(employees.getSchedules(id, owner(jwt)), null);
    }

    @PostMapping("/employees")
    public ApiResponse<EmployeeResponse> addEmployee(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody EmployeeRequest request) {
        return ApiResponse.success(employees.addEmployee(request, owner(jwt)), null);
    }

    @PutMapping("/employees/{id}")
    public ApiResponse<EmployeeResponse> updateEmployee(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id, @Valid @RequestBody EmployeeRequest request) {
        return ApiResponse.success(employees.updateEmployee(id, request, owner(jwt)), null);
    }

    @DeleteMapping("/employees/{id}")
    public ApiResponse<Void> removeEmployee(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id) {
        employees.deleteEmployee(id, owner(jwt));
        return ApiResponse.success(null, null);
    }

    @GetMapping("/reviews")
    public ApiResponse<PageResponse<ReviewResponse>> reviews(@AuthenticationPrincipal Jwt jwt, @RequestParam(defaultValue = "0") int page) {
        return ApiResponse.success(reviews.getSalonReviews(salons.getMySalonId(owner(jwt)), PageRequest.of(Math.max(0, page), 20)), null);
    }

    @PostMapping("/reviews/{id}/reply")
    public ApiResponse<ReviewResponse> reply(@AuthenticationPrincipal Jwt jwt, @PathVariable Long id, @Valid @RequestBody ReviewReplyRequest request) {
        return ApiResponse.success(reviews.replyToReview(id, request, owner(jwt)), null);
    }
}
