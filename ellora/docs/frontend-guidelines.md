# Frontend Guidelines

Tài liệu này định nghĩa các quy tắc lập trình Frontend, cấu trúc thư mục, quy tắc UI/UX, và đặc biệt là bộ quy chuẩn SEO & SSR-Ready cho toàn bộ dự án Ellora.

## 1. Cấu Trúc Thư Mục Frontend

Frontend nên tập trung vào user flow rõ ràng và cấu trúc Angular sạch.

```text
frontend/src/app/
├── config/        # Chứa cấu hình api và Cognito
├── core/          # Phần dùng một lần (app config, routes...)
├── features/      # Từng module/tính năng (auth, owner, customer, bookings...)
├── guards/        # Chứa auth.guard.ts bảo vệ các route riêng tư
├── interceptors/  # Interceptor đính kèm Cognito JWT token
├── layouts/       # Chứa main-layout và owner-layout
├── models/        # Định nghĩa kiểu dữ liệu TypeScript (auth.model.ts, ellora.model.ts)
├── services/      # Các service gọi API (auth, booking, profile-api, mock-data...)
└── shared/        # Shared components dùng chung (avatar, button, rating, salon-card...)
```

### Gợi ý cấu trúc feature:
```text
frontend/src/app/features/
├── auth/
├── salons/
├── bookings/
├── owner/
└── reviews/
```

---

## 2. Quy Tắc Code & Styling Frontend

- **Bắt buộc sử dụng skill `design-taste-frontend`**: Mặc định áp dụng skill `design-taste-frontend` khi xây dựng, chỉnh sửa hoặc đánh giá giao diện (UI/UX) của ứng dụng. Hướng tới thiết kế "premium", anti-slop, có tính thẩm mỹ cao thay vì giao diện cơ bản.
- **Styling**: Sử dụng Tailwind CSS kết hợp với CSS/SCSS tùy chỉnh. Tận dụng tối đa các class tiện ích của Tailwind để viết CSS linh hoạt, sạch sẽ và đảm bảo tính nhất quán của thiết kế.
- **Dữ liệu & Mô phỏng (Mock Data)**: Khi chưa có endpoint API backend thật tương ứng, sử dụng `MockDataService` để trả về các dữ liệu mẫu thực tế.
- **Authentication**: Tương tác với Cognito thông qua Amplify Auth API trong `AuthService`. Đảm bảo kiểm tra trạng thái login qua signals/promises.
- Component chỉ nên tập trung vào UI logic.
- API call nên đưa vào service.
- Dùng strongly typed interface/model từ `models/ellora.model.ts` hoặc `models/auth.model.ts`.
- Dùng Reactive Forms cho form phức tạp như login, register, booking, salon profile.
- Tránh duplicate CSS khi có thể tái sử dụng shared style hoặc shared component.
- Không hard-code backend URL ở nhiều component; sử dụng `ApiConfig` hoặc environment.
- Không làm fake feature mà backend không hỗ trợ, trừ khi ghi rõ là mock/demo.
- Ưu tiên mobile-first responsive UI.
- Dùng Angular Router rõ ràng, route name dễ hiểu.
- Dùng route guard khi có authentication/authorization.
- Dùng interceptor cho JWT token khi auth đã ổn định.
- Dùng service + RxJS trước; không thêm NgRx nếu chưa thật sự cần.
- Form nên đơn giản và validate input rõ ràng.
- Các trang `/admin/...` dùng `AdminLayout` chung cho header, menu, chiều rộng và lề. Trang con dùng `.admin-page`, `.admin-page-header` và `features/admin-content/admin-page.scss`; không thêm menu hoặc max-width/padding riêng ở từng trang. Bảng cuộn ngang trong `.table-wrap` để giữ khung mobile.

---

## 3. Quy Tắc Frontend Chuẩn Bị Cho SEO & SSR

**Mục tiêu:**
Frontend của Ellora được phát triển theo định hướng **SSR & SEO Ready** ngay từ MVP. Hạn chế tối đa việc refactor khi triển khai Angular SSR hoặc SSG trong tương lai. Giữ kiến trúc frontend nhất quán và dễ mở rộng.
*(Lưu ý: Mọi code mới phải tuân thủ các quy tắc dưới đây dù MVP chưa bật cấu hình SSR).*

### 3.1. SSR Compatibility

- **Không truy cập Browser API trực tiếp:** Không được truy cập trực tiếp các Browser API sau trong: `constructor`, `field initializer`, `ngOnInit`, `service khởi tạo`. (Bao gồm: `window`, `document`, `navigator`, `localStorage`, `sessionStorage`, `history`, `location`). Nếu cần sử dụng, phải: kiểm tra bằng `isPlatformBrowser()`, hoặc sử dụng `@Inject(DOCUMENT)` khi phù hợp.
- **Không viết Component phụ thuộc Browser:** Component phải có khả năng render trên Server. Mọi thao tác liên quan đến: kích thước màn hình, scroll, focus, clipboard, media query, browser event đều phải được kiểm tra môi trường trước khi thực thi.
- **Không tạo tiến trình chạy vô thời hạn:** Ví dụ: `setInterval`, `requestAnimationFrame`, `WebSocket`, `Observable` không unsubscribe, `Promise` không bao giờ resolve. Các tiến trình này có thể khiến quá trình SSR hoặc Pre-render không thể kết thúc.

### 3.2. SEO Metadata & Structured Data
- Các Public Page phải hỗ trợ SEO Metadata. Bao gồm tối thiểu: `Title`, `Meta Description`.
- Không cập nhật Title hoặc Meta trực tiếp ở nhiều Component. Ưu tiên sử dụng một `SeoService` dùng chung để quản lý toàn bộ Metadata.
- Các trang Public cần được thiết kế để dễ dàng bổ sung Structured Data (JSON-LD) như `LocalBusiness`, `Service`, `Article`. Việc sinh Structured Data nên được thực hiện thông qua service dùng chung thay vì hard-code trong từng Component.
- Các entity Public nên chuẩn bị sẵn dữ liệu phục vụ SEO (slug, shortDescription, rating, openingHours...).

### 3.3. Routing, URL & Điều Hướng
- Tất cả URL public phải thân thiện với SEO. Ưu tiên: `/salons/ho-chi-minh`, thay vì dùng `?id=15`.
- Mọi entity public nên có: `id`, `slug`. Slug phải ổn định, dễ đọc và thân thiện với SEO.
- **Điều hướng:** Đối với các liên kết điều hướng nội bộ như menu, card, breadcrumb, danh sách salon, ưu tiên sử dụng `routerLink` thay vì xử lý `(click)` rồi gọi `Router.navigate()`. Điều này giúp HTML rõ ràng hơn và hỗ trợ khả năng crawl. Các trang Public nên liên kết với nhau (Internal Linking) và dùng Breadcrumb.

### 3.4. Semantic HTML, Accessibility & Performance
- Ưu tiên sử dụng Semantic HTML phù hợp (`header`, `nav`, `main`, `section`, `article`, `footer`). Không sử dụng `div` khi đã có phần tử semantic phù hợp.
- Mỗi trang chỉ được có **một thẻ h1**. Các heading phải tuân theo cấu trúc hợp lý (h1 -> h2 -> h3).
- Tất cả ảnh phải có thuộc tính `alt`. Hình ảnh nên hỗ trợ `loading="lazy"`, `width`, `height` để giảm Layout Shift.
- Form phải có `label` (hoặc `aria-label` khi cần). Button phải sử dụng đúng mục đích. Không dùng div/span giả lập button.
- Các Feature lớn nên Lazy Load (Blog, Booking, Dashboard, Admin).

### 3.5. Checklist khi tạo Public Page mới
Mỗi Public Page nên tự kiểm tra các tiêu chí sau trước khi hoàn thành:
- [ ] URL thân thiện với SEO và có slug.
- [ ] Có Title và Meta Description.
- [ ] Có đúng một thẻ `h1`.
- [ ] Sử dụng Semantic HTML phù hợp.
- [ ] Ảnh có `alt`.
- [ ] Điều hướng nội bộ sử dụng `routerLink` khi phù hợp.
- [ ] Không truy cập Browser API trực tiếp (đã xử lý nền tảng).
- [ ] Không tạo tiến trình bất đồng bộ chạy vô thời hạn.
- [ ] Sẵn sàng bổ sung Structured Data.
- [ ] Sẵn sàng hoạt động khi chuyển sang SSR trong tương lai.
