# Architecture and Tech Stack

Tài liệu này định nghĩa các quyết định kỹ thuật, kiến trúc hệ thống và phạm vi tính năng của dự án Ellora.

## 1. Tech Stack

Sử dụng stack dưới đây trừ khi người dùng yêu cầu thay đổi rõ ràng.

### Frontend
- **Framework**: Angular
- **Ngôn ngữ**: TypeScript
- **Styling**: Tailwind CSS + Custom SCSS/CSS (dự án đã tích hợp Tailwind CSS)
- **UI Library**: Các component tự viết sử dụng CSS/Tailwind (không cài đặt Angular Material theo cấu hình mặc định)
- **Authentication**: AWS Cognito sử dụng thư viện `aws-amplify/auth`
- **HTTP Client**: Angular HttpClient
- **Form**: Reactive Forms
- **Routing**: Angular Router
- **State management**: Service + RxJS
- **Định hướng thiết kế**: mobile-first, responsive UI

### Backend
- **Framework**: Spring Boot
- **Ngôn ngữ**: Java (Java 17)
- **Kiểu API**: REST API
- **Persistence**: Spring Data JPA / Hibernate
- **Validation**: Jakarta Bean Validation
- **Authentication**: OAuth2 Resource Server JWT tích hợp với AWS Cognito làm Identity Provider

### Database
- **Database chính**: PostgreSQL
- **Cache / lock**: Redis chỉ dùng khi được yêu cầu rõ ràng cho caching hoặc khóa slot booking
- **Migration / Schema**: Hibernate `ddl-auto: update` tự động quản lý schema qua JPA Entities (không dùng Flyway/Liquibase)

### Storage
- **Lưu ảnh**: Cloudinary cho ảnh salon, ảnh mẫu nail, avatar và ảnh review

### Deployment
- **Frontend**: Cloudflare Pages / Cloudflare Hosting
- **Backend**: Render (Có định hướng chuyển GCP sau này)
- **Database**: PostgreSQL trên Render, Supabase, Neon hoặc dịch vụ tương tự
- **CDN / DNS**: Cloudflare

### Owner salon location
- Hồ sơ owner dùng Leaflet tải khi mở bản đồ và OpenStreetMap để chọn/kéo ghim; không cần API key hoặc tài khoản billing. Tọa độ lưu qua luồng admin duyệt hồ sơ hiện có. Chỉ tải tile hiển thị, giữ attribution và cache trình duyệt theo chính sách OpenStreetMap; xem `decisions/2026-10-18-owner-salon-location.md`.

---

## 2. Cấu Trúc Repository Mong Muốn

```text
nail-salon-booking/
├── frontend/
├── backend/
├── database/
├── docs/
│   ├── architecture-and-stack.md
│   ├── frontend-guidelines.md
│   ├── backend-guidelines.md
│   ├── api-database-guidelines.md
│   ├── workflow-guidelines.md
│   └── product-spec.md
├── AGENTS.md
├── README.md
└── .gitignore
```

Ghi chú:
- Tách riêng frontend và backend.
- Tài liệu sản phẩm và sơ đồ để trong `docs/`.
- Script database để trong `database/`.
- Không commit secret vào repository.

---

## 3. Phạm Vi MVP

Không triển khai tính năng ngoài MVP nếu chưa được yêu cầu rõ ràng.

### Tính năng MVP
Tập trung vào:
- Authentication
- Quản lý tài khoản khách hàng
- Quản lý tài khoản chủ salon
- Quản lý hồ sơ salon
- Quản lý dịch vụ và bảng giá
- Tìm kiếm và lọc salon
- Trang chi tiết salon
- Luồng đặt lịch cơ bản
- Quản lý booking cho chủ salon
- Review và rating sau khi booking hoàn thành
- Admin moderation cơ bản chỉ khi được yêu cầu

### Tính năng mở rộng sau MVP (Future Enhancements)
Có thể nhắc đến trong tài liệu nếu hữu ích, nhưng không code mặc định:
- AI recommendation, Gợi ý mẫu nail bằng AI
- Google Maps / Mapbox integration
- Online payment, Đặt cọc / payment gateway (Momo / VNPay / ZaloPay)
- Zalo / SMS / Email automation notification
- Real-time chat, Push notification
- Loyalty points, Voucher system, Flash deals
- Gói subscription cho khách hàng, Mobile app
- Advanced analytics dashboard, Multi-branch salon management

Khi không chắc một tính năng thuộc MVP hay future enhancement, hãy hỏi trước khi triển khai.
