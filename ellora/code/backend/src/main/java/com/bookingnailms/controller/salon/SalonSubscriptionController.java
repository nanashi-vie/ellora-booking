package com.bookingnailms.controller.salon;

import com.bookingnailms.dto.common.*;
import com.bookingnailms.dto.subscription.SubscriptionDtos.*;
import com.bookingnailms.enums.*;
import com.bookingnailms.exception.BadRequestException;
import com.bookingnailms.service.SalonSubscriptionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController @RequiredArgsConstructor
public class SalonSubscriptionController {
    private final SalonSubscriptionService subscriptions;
    @GetMapping("/salon-plans") public ApiResponse<List<Plan>> catalog() { return ApiResponse.success(subscriptions.catalog(),null); }
    @GetMapping("/owner/subscription") public ApiResponse<State> state(@AuthenticationPrincipal Jwt jwt) {
        return ApiResponse.success(subscriptions.ownerState(UUID.fromString(jwt.getSubject())),null);
    }
    @GetMapping("/owner/subscription/requests") public ApiResponse<PageResponse<Request>> ownerHistory(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(defaultValue="0") int page, @RequestParam(defaultValue="20") int size) {
        return ApiResponse.success(subscriptions.ownerHistory(UUID.fromString(jwt.getSubject()),page(page,size)),null);
    }
    @PostMapping("/owner/subscription/requests") public ApiResponse<Request> create(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody Create body) {
        return ApiResponse.success(subscriptions.create(UUID.fromString(jwt.getSubject()),body),"Đã tạo hướng dẫn chuyển khoản. Gói chỉ kích hoạt sau khi Admin xác nhận đã nhận tiền.");
    }
    @PostMapping("/owner/subscription/requests/{id}/payment") public ApiResponse<Request> payment(@AuthenticationPrincipal Jwt jwt,
            @PathVariable Long id, @Valid @RequestBody PaymentReport body) {
        return ApiResponse.success(subscriptions.reportPayment(UUID.fromString(jwt.getSubject()),id,body),"Đã báo chuyển khoản, đang chờ Admin đối soát. Gói chưa được kích hoạt.");
    }
    @PostMapping("/owner/subscription/requests/{id}/prepare-payment") public ApiResponse<Request> preparePayment(@AuthenticationPrincipal Jwt jwt,
            @PathVariable Long id) {
        return ApiResponse.success(subscriptions.preparePayment(UUID.fromString(jwt.getSubject()),id),"Đã chuẩn bị hướng dẫn chuyển khoản cho yêu cầu.");
    }
    @GetMapping("/admin/subscription-plans") public ApiResponse<List<Plan>> adminCatalog() { return ApiResponse.success(subscriptions.catalog(),null); }
    @PutMapping("/admin/subscription-plans/{tier}") public ApiResponse<Plan> update(@PathVariable SubscriptionTier tier,
            @AuthenticationPrincipal Jwt jwt, @Valid @RequestBody PlanUpdate body) {
        return ApiResponse.success(subscriptions.updatePlan(tier,body,UUID.fromString(jwt.getSubject())),null);
    }
    @GetMapping("/admin/subscription-requests") public ApiResponse<PageResponse<Request>> adminHistory(
            @RequestParam(required=false) SubscriptionRequestStatus status, @RequestParam(defaultValue="0") int page,
            @RequestParam(defaultValue="20") int size) { return ApiResponse.success(subscriptions.adminHistory(status,page(page,size)),null); }
    @PatchMapping("/admin/subscription-requests/{id}") public ApiResponse<Request> decide(@PathVariable Long id,
            @AuthenticationPrincipal Jwt jwt, @Valid @RequestBody Decision body) {
        return ApiResponse.success(subscriptions.decide(id,body,UUID.fromString(jwt.getSubject())),null);
    }
    private Pageable page(int number, int size) {
        var page = PageRequest.of(Math.max(0,number),Math.max(1,Math.min(size,50)),Sort.by("id").descending());
        if (page.getOffset() > Integer.MAX_VALUE) throw new BadRequestException("Trang yêu cầu quá lớn.");
        return page;
    }
}
