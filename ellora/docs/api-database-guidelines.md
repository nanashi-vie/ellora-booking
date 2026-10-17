# API & Database Guidelines

Tài liệu này quy định các chuẩn mực về giao tiếp API, cấu trúc Database, và các vấn đề liên quan đến bảo mật dữ liệu.

## 1. Quy Tắc REST API

Dùng REST-style endpoints. Việc xác thực và quản lý tài khoản người dùng được tích hợp trực tiếp với AWS Cognito từ phía client (sử dụng Cognito SDK/Amplify). 

Client gửi yêu cầu đồng bộ profile sang database backend qua endpoint `/profiles/me`. Các API request bảo mật yêu cầu đính kèm header `Authorization: Bearer <Cognito_JWT_Access_Token>`.

### 1.1. Ví dụ các endpoint tiêu chuẩn
```http
# Authentication & Profile Sync
POST /api/profiles/me                  # Đồng bộ thông tin profile từ Cognito JWT khi đăng nhập/đăng ký
GET /api/profiles/me                   # Lấy thông tin cá nhân của user đang đăng nhập

# Salons
GET /api/salons
GET /api/salons/{id}
POST /api/salons
PATCH /api/salons/{id}

# Services
GET /api/salons/{salonId}/services
POST /api/salons/{salonId}/services
PATCH /api/services/{id}
DELETE /api/services/{id}

# Bookings
POST /api/bookings                     # Tạo booking mới (mặc định trạng thái PENDING)
GET /api/bookings/my                   # Lấy danh sách booking của khách hàng hiện tại
GET /api/salon/bookings                # Lấy danh sách booking của salon (cho salon owner)
PATCH /api/bookings/{id}/status        # Cập nhật trạng thái booking (PENDING -> CONFIRMED, CANCELLED, v.v.)

# Completion confirmation (customer) and disputed completion (admin)
POST /api/bookings/{id}/completion-response       # {completed, completionVersion, reason?}; chỉ khách của lịch
GET /api/admin/booking-disputes                  # Phân trang; lọc status OPEN/UPHELD/REOPENED
GET /api/admin/booking-disputes/{id}             # Lịch hẹn, phản ánh và liên hệ hai bên; chỉ admin
PATCH /api/admin/booking-disputes/{id}/resolution # {outcome: UPHELD|REOPENED, note}; ghi nhận admin xử lý

# Reviews
POST /api/reviews                      # Tạo review mới cho salon sau khi booking COMPLETED
GET /api/salons/{salonId}/reviews      # Lấy danh sách review của salon
```

### 1.2. Nguyên tắc thiết kế API
- Giữ tên endpoint nhất quán. Dùng danh từ số nhiều khi phù hợp.
- Dùng request DTO và response DTO.
- Validate các field bắt buộc bằng các annotation javax/jakarta validation.
- Trả lỗi có ý nghĩa, sử dụng `GlobalExceptionHandler`.
- Không tự tạo endpoint mới nếu task không yêu cầu.
- Dùng pagination cho list endpoint khi dữ liệu có thể tăng, đặc biệt là salons, bookings và reviews.

---

## 2. Quy Tắc Database

Dùng PostgreSQL làm database chính.

### 2.1. Cấu trúc bảng dự kiến
```text
users
roles
salons
salon_hours
staff
services
bookings
reviews
media
```

### 2.2. Nguyên tắc thiết kế DB
- Dùng tên bảng rõ ràng.
- Dùng foreign key cho quan hệ.
- Tránh lưu dữ liệu trùng lặp nếu không cần thiết.
- Không lưu password dạng plain text.
- Sample data nên thực tế nhưng đơn giản.
- Thêm index cho filter và lookup phổ biến khi cần.
- Không tối ưu quá sớm trước khi flow cơ bản chạy ổn.

### 2.3. Vị trí script & Indexing
Vị trí script database đề xuất:
```text
database/
├── schema.sql
└── sample-data.sql
```

Một số index hữu ích về sau:
- `salons(city, district)`
- `salons(rating_avg)`
- `services(salon_id)`
- `bookings(customer_id)`
- `bookings(salon_id)`
- `bookings(booking_date, start_time)`
- `reviews(salon_id)`

---

## 3. Quy Tắc Bảo Mật

Không bao giờ đưa giá trị nhạy cảm vào code hoặc tài liệu. Không commit:
- Database password
- API key
- JWT secret
- GitHub/GitLab token
- Tài khoản admin thật
- Private production URL

Dùng environment variables hoặc local config file cho secret.

Với authentication:
- Hash password trước khi lưu (N/A nếu dùng Cognito).
- Không trả password field trong API response.
- Dùng role-based authorization khi triển khai security.
- JWT có thể thêm sau khi CRUD cơ bản và booking logic đã ổn định.
- Cấu hình CORS rõ ràng và theo environment.
