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
POST /api/bookings/guest               # Khách không đăng nhập; nhận biên nhận tối giản, không mở API đọc/sửa công khai
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

Thông tin hỗ trợ nền tảng gồm `GET /api/support/contact` (public, chỉ trả email/số điện thoại/link Facebook đã cấu hình) và `PUT /api/admin/support/contact` (chỉ ADMIN). Thông tin được chỉnh ở `/admin/support`; Supabase cần áp dụng `code/backend/src/main/resources/db/platform-support-contact.sql` trước khi deploy vì production dùng `ddl-auto:none`.

### 1.2. Nguyên tắc thiết kế API

Giám sát dùng `GET /api/ping` cho liveness không truy cập database; `GET /api/ping/db` kiểm tra readiness bằng `SELECT 1` qua pool hiện có. Readiness trả 200 khi thành công hoặc 503 với thông báo chung khi lỗi/bận, luôn `Cache-Control: no-store`; data gồm `status: UP|DOWN` và `latencyMs`, không chứa thông tin kết nối/lỗi SQL. Chỉ một probe DB được chạy trên mỗi backend instance. Timeout câu lệnh JDBC là 3 giây, tách biệt timeout lấy kết nối Hikari hiện tại 30 giây; đây không phải cam kết HTTP hoàn thành trong 3 giây. UptimeRobot có thể dùng URL readiness khi muốn giám sát cả database. Chi tiết và kiểm chứng: `decisions/2026-10-18-database-readiness-ping.md`.

Tìm salon công khai dùng `GET /api/customer/salons` với `keyword`, `location`, `date`, `time`, `latitude`, `longitude`, `radiusKm`, `sort`, `page`, `size` tùy chọn. Từ khóa khớp tên tiệm hoặc dịch vụ đang hoạt động (giữ khớp city/district cũ); địa điểm khớp địa chỉ/quận/thành phố, có chuẩn hóa Unicode. Ngày/giờ chỉ lọc **giờ mở cửa**, có áp dụng ngày nghỉ và mốc online trước ít nhất một giờ theo giờ Việt Nam; không khẳng định còn lịch trống. `sort` nhận `newest`, `rating`, `distance`; khoảng cách/bán kính được lọc, đếm và sắp xếp trong database trước khi phân trang. Summary thêm vị trí đã duyệt và `distanceKm` tùy chọn; không bịa `(0,0)` cho tiệm chưa có ghim. Chi tiết kiểm tra đầu vào, giờ mặc định và phân trang: `decisions/2026-10-18-public-search-nearby.md`.

Định vị chỉ xin khi khách chủ động bấm. Tọa độ thiết bị nằm trong bộ nhớ phiên, không ghi vào đường dẫn frontend hay storage. Truy vấn GET đến API bên thứ nhất có cặp tọa độ; không ghi log ứng dụng hoặc transfer-cache kết quả định vị vào SSR HTML. Bản đồ hiển thị ghim thật của trang kết quả hiện tại, có ghi nguồn OpenStreetMap.

Gói salon theo tháng dùng `GET /api/salon-plans` công khai; `registrationAvailable` phản ánh trạng thái mở gói, giá dương và QR nhận tiền đã cấu hình. Owner tạo yêu cầu với giá đã xác nhận, nhận QR đã lưu và nội dung riêng `ELLORA GOI{id}`, rồi báo chuyển khoản qua `POST /api/owner/subscription/requests/{id}/payment`. Yêu cầu cũ thiếu QR dùng `POST .../{id}/prepare-payment`. Báo chuyển khoản không kích hoạt gói: admin phải đối soát, gửi `paymentReceived=true` và `expectedAmount` đúng giá đã chấp nhận khi duyệt. QR/báo chuyển khoản/đối soát chỉ trả cho owner của tiệm và admin; public chỉ có huy hiệu/gói còn hiệu lực. Các mốc tháng, gia hạn, khóa đồng thời, migration và tương thích dữ liệu cũ được định nghĩa ở `decisions/2026-10-18-salon-subscription-plans.md` và bản sửa luồng thanh toán `decisions/2026-10-18-subscription-bank-transfer.md`.

Guest tự đặt dùng `{salonId,serviceId,employeeId?,scheduledAt,fullName,phone,email,customerNote?}`; họ tên, SĐT, email hợp lệ và ngày giờ bắt buộc. Trả `{id,status,scheduledAt,salonName,serviceName}`. Giữ quy tắc online trước ít nhất 1 giờ theo giờ Việt Nam; không tạo hoặc liên kết profile theo email. Đúng `POST /bookings/guest` cho anonymous/CUSTOMER; owner/admin có token bị chặn. Giới hạn mỗi email 5 yêu cầu/10 phút trên từng backend instance; mọi endpoint lịch sử, hủy, đánh giá và phản hồi hoàn thành vẫn yêu cầu tài khoản/quyền sở hữu.
- Giữ tên endpoint nhất quán. Dùng danh từ số nhiều khi phù hợp.
- Dùng request DTO và response DTO.
- Hồ sơ salon nhận thêm cặp `latitude` / `longitude` tùy chọn, phải hữu hạn và nằm trong [-90,90] / [-180,180]. `PUT /api/owner/salon` gửi đề xuất chờ admin duyệt, kể cả khi chỉ thay đổi tọa độ; không cập nhật vị trí công khai ngay. Bỏ qua hoặc gửi null cả cặp giữ vị trí đã lưu, và yêu cầu JSON cũ không có tọa độ không xóa vị trí khi duyệt.
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
