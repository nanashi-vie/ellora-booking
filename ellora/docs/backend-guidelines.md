# Backend Guidelines

Tài liệu này định nghĩa cấu trúc phân lớp, quy tắc code Spring Boot, cấu trúc Entity, và luồng trạng thái Booking cho backend của dự án Ellora.

## 1. Cấu Trúc Backend

Backend nên dùng cấu trúc phân lớp rõ ràng của Spring Boot:
`controller → service → repository → database`

```text
backend/src/main/java/.../
├── controller/
├── service/
├── repository/
├── entity/
├── dto/
├── config/
├── exception/
└── security/
```

## 2. Quy Tắc Lập Trình Spring Boot

- Controller chỉ nhận request và trả response.
- Business logic đặt trong service.
- Truy cập database đặt trong repository.
- Dùng DTO cho request và response.
- Dùng validation annotation cho các field bắt buộc.
- Không expose dữ liệu nhạy cảm như password hash.
- Không trả entity trực tiếp nếu DTO phù hợp hơn.
- Giữ response API nhất quán.
- Không tự tạo endpoint mới nếu task không yêu cầu.
- Ưu tiên service method rõ ràng, dễ đọc hơn abstraction quá chung chung.
- Dùng `@RestController` cho REST controller.
- Dùng `@Service` cho business logic.
- Dùng `JpaRepository` cho repository.
- Dùng `@Valid` và validation annotations cho input validation.
- Dùng `@ControllerAdvice` để xử lý lỗi tập trung khi cần.
- Tránh đặt business logic trong controller.
- Tránh trả entity trực tiếp từ public API.

## 3. Entity Backend Chính

Các entity core của dự án:
- **User** (mapped to `@Table(name = "profiles")`)
- **Role** (lưu dạng Enum: `CUSTOMER`, `SALON_OWNER`, `ADMIN`)
- **Salon** (table `salons`, có quan hệ `owner` 1-1 với `User`)
- **Employee** (table `employees` thay cho `Staff`)
- **WorkingSchedule** (table `working_schedules` thay cho `SalonHour`)
- **NailService** (table `nail_services` thay cho `Service`)
- **ServiceCategory** (table `service_categories` phân loại dịch vụ)
- **Booking** (table `bookings`)
- **Review** (table `reviews` để lại sau booking)
- **Payment** (table `payments` lưu thông tin thanh toán nếu có)
- **Media**: Sử dụng lưu trữ URL trực tiếp trong các cột thực thể (ví dụ: `avatarUrl`, `logoUrl`, `imageUrls` kiểu ElementCollection) thay vì bảng Media riêng.

## 4. Booking Status & Logic

Dùng booking status từ enum `BookingStatus`:

```text
PENDING        // Chờ xác nhận
CONFIRMED      // Đã xác nhận
IN_PROGRESS    // Đang làm
COMPLETED      // Hoàn thành
CANCELLED      // Đã hủy
REJECTED        // Bị từ chối
```

### Quy tắc booking:
- Booking mới tạo phải bắt đầu với trạng thái `PENDING`.
- Guest đặt online không có `customer_id`, có `guest_email` và tên/SĐT trên lịch; vẫn phải đặt trước ít nhất 1 giờ, chọn chính xác đến phút và tuân thủ giờ hoạt động/ngày nghỉ/trùng lịch. Walk-in do owner thêm giữ quy tắc cũ. Không suy ra loại lịch chỉ từ `customer == null`; dùng `isWalkIn()` và các contact helper khi xử lý mail/hiển thị. Guest không có tài khoản nên không tham gia luồng review/phản hồi hoàn thành qua tài khoản.
- Chủ salon có thể xác nhận (`CONFIRMED`), từ chối (`REJECTED`), bắt đầu thực hiện (`IN_PROGRESS`), hoặc hoàn thành (`COMPLETED`) hoặc hủy (`CANCELLED`) booking.
- Khách hàng chỉ có thể review khi booking ở trạng thái `COMPLETED` và khách đã xác nhận sử dụng dịch vụ hoặc admin đã công nhận hoàn thành. Đánh giá cũ được giữ nguyên.
- Tránh trùng booking cho cùng salon, employee, service, ngày và khung giờ.
- Redis locking chỉ thêm sau nếu được yêu cầu rõ ràng để xử lý race condition.

### Xác nhận hoàn thành và phản ánh
- Khi tiệm hoàn thành một lịch online, `completionConfirmation` chuyển sang `PENDING`; khách có thể xác nhận (`CONFIRMED`) hoặc gửi lý do chưa hoàn thành (`DISPUTED`). Mỗi lần hoàn thành mới có `completionVersion` riêng để chặn phản hồi từ phiên cũ.
- Phản ánh lưu trong `booking_completion_disputes`; chỉ admin xem đầy đủ thông tin liên hệ hai bên và xử lý. Admin ghi kết luận, chọn `UPHELD` (booking giữ `COMPLETED`, xác nhận `ADMIN_CONFIRMED`) hoặc `REOPENED` (booking về `IN_PROGRESS`). Giữ lịch sử từng lần xử lý; không tự tạo lịch mới hoặc hoàn tiền.
- `COMPLETED` tiếp tục tham gia báo cáo cho đến khi admin trả lịch về `IN_PROGRESS`. Giữ nguyên thời điểm hoàn thành khi khách phản hồi hoặc admin công nhận để không làm lệch kỳ báo cáo.
- Supabase dùng `ddl-auto:none`: áp dụng `code/backend/src/main/resources/db/booking-completion-confirmation.sql` trước khi chạy backend có tính năng này. Chi tiết hợp đồng và kiểm chứng ở `docs/decisions/2026-10-17-booking-completion-confirmation.md`.
