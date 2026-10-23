# Tài liệu Ellora

## Sản phẩm và kỹ thuật

- [Đặc tả sản phẩm](product-spec.md): đối tượng sử dụng, phạm vi MVP và luồng chính.
- [Kiến trúc và công nghệ](architecture-and-stack.md): stack, cấu trúc dự án và triển khai.
- [Frontend](frontend-guidelines.md): Angular, giao diện, SEO và SSR.
- [Backend](backend-guidelines.md): Spring Boot, phân lớp và nghiệp vụ.
- [API, dữ liệu và bảo mật](api-database-guidelines.md): hợp đồng API và quy tắc dữ liệu.
- [Quy trình làm việc](workflow-guidelines.md): Git, tài liệu và tiêu chí hoàn thành.

## Hướng dẫn cho AI

- [Bối cảnh](ai/context.md), [quy ước](ai/conventions.md) và [quy trình](ai/workflows.md).
- Prompt cho [lập kế hoạch](ai/prompts/architect.md), [triển khai](ai/prompts/codex.md), [review](ai/prompts/review.md) và [kiểm chứng](ai/prompts/verify.md).
- Prompt hỗ trợ: [review dự án](ai/prompts/hermes-project-review.md), [cập nhật kiến thức](ai/prompts/knowledge.md) và [tóm tắt release](ai/prompts/release.md).

## Quyết định và vận hành

- [Nhật ký quyết định](decisions/README.md): các bản ghi theo ngày về nghiệp vụ, giao diện và ràng buộc kỹ thuật. Giữ các bản ghi còn liên quan, kể cả khi chưa được tài liệu khác dẫn liên kết.
- [Font chữ](decisions/2026-10-23-typography.md): vai trò font và kết quả kiểm tra.
- Tài liệu vận hành nằm cạnh backend: [email và thông báo](../code/backend/BOOKING-NOTIFICATIONS.md), [doanh thu và thanh toán](../code/backend/REVENUE-BILLING.md), [Cloudinary](../code/backend/CLOUDINARY.md).

## Tài nguyên giao diện

Minion Pro và Inter chỉ được lưu tại [`code/frontend/public/fonts/`](../code/frontend/public/fonts/README.md). Khai báo font và biến family nằm trong [`src/styles/fonts.css`](../code/frontend/src/styles/fonts.css), được stylesheet toàn cục import.

Thư mục `docs` chỉ giữ tài liệu. Bộ font sao chép, các ảnh xuất giao diện cũ và báo cáo merge/release đã kết thúc đã được dọn bỏ. Ảnh dashboard đang dùng trên trang chủ vẫn nằm tại `code/frontend/public/owner-pageDemo.png`.
