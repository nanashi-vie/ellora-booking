# Thông báo lịch hẹn

- Tạo lịch PENDING: lưu email cho email của salon, nếu trống dùng email chủ salon.
- Khách không đăng nhập đặt qua `POST /api/bookings/guest`: bắt buộc họ tên, SĐT, email và ngày giờ. Lưu thông tin riêng trên lịch, không tạo/gắn tài khoản; gửi thêm biên nhận `BOOKING_RECEIVED` cho khách với trạng thái chờ tiệm xác nhận. API chỉ trả mã lịch, trạng thái, thời gian, tên tiệm/dịch vụ; không có lịch sử hay thao tác công khai bằng mã lịch.
- Tiệm xác nhận PENDING → CONFIRMED: lưu email xác nhận cho khách.
- Email xác nhận và nhắc trước 1 giờ hỗ trợ cả khách có tài khoản và khách đặt không đăng nhập. Khách được owner thêm trực tiếp tại tiệm (walk-in, không có email) giữ luồng cũ.
- Nhắc lịch cho khách khoảng 1 giờ trước hẹn: mỗi phút quét các lịch online `CONFIRMED` còn trong 1 giờ sắp tới, theo giờ Việt Nam. Bao gồm cả lịch đã được xác nhận trước khi triển khai chức năng. Nội dung có mã lịch, tên tiệm, dịch vụ, giờ hẹn, địa chỉ và số liên hệ tiệm nếu có.
- Mỗi lịch chỉ có một email loại `APPOINTMENT_REMINDER`, nhờ khóa unique hiện có và chèn nguyên tử. Trước mỗi lần gửi/thử lại, worker đọc lại lịch: bỏ reminder chưa gửi của lịch bị hủy, từ chối, đã bắt đầu, hoàn thành, quá giờ hoặc không có khách/email. Nếu giờ hẹn đổi sang tương lai xa hơn, reminder chờ đến mốc giờ mới. Không ghi nhận email đã bỏ là đã gửi.
- Hàng đợi `booking_emails` lưu cùng transaction với lịch hẹn. Worker chạy mỗi 10 giây, lỗi SMTP tự thử lại, khoảng cách tăng dần tối đa 1 giờ. Cấu hình mail chưa bật thì email vẫn chờ trong DB.
- Xác nhận lặp không tạo thêm email. SMTP có thể gửi trùng nếu tiến trình bị dừng đúng lúc SMTP đã nhận nhưng DB chưa ghi nhận; không cam kết exactly-once.
- Backend cần đang chạy và mail được bật để nhắc đúng thời điểm. Nếu backend ngủ/mạng lỗi, reminder có thể đến muộn nhưng chỉ được thử gửi khi lịch vẫn chưa bắt đầu. Kiểm tra trạng thái trước SMTP không thể thu hồi mail nếu lịch bị hủy đồng thời sau bước kiểm tra.

## Cấu hình trong `.env.supabase` hoặc biến môi trường máy chủ

```dotenv
MAIL_ENABLED=true
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=YOUR_SENDER_EMAIL
MAIL_PASSWORD=YOUR_GMAIL_APP_PASSWORD
MAIL_FROM=YOUR_SENDER_EMAIL
```

Dùng mật khẩu ứng dụng Gmail, không dùng mật khẩu đăng nhập. Không commit cấu hình thật. Khởi động lại backend sau khi đổi cấu hình. Chưa có thông tin SMTP thì để `MAIL_ENABLED=false`.

## Schema

JPA quản lý entity `BookingEmail` khi `ddl-auto=update`. Profile Supabase giữ `ddl-auto=none`; chạy script `src/main/resources/db/booking-emails.sql` một lần trước khi chạy bản mới trên DB đó. Guest tự đặt cần thêm `src/main/resources/db/guest-self-booking.sql` trước khi triển khai. Script thêm cột nullable, không sửa dữ liệu lịch hẹn cũ.

## Chuông

Mở trang owner, bấm **Bật chuông lịch hẹn** mỗi lần mở lại trang để trình duyệt cho phép âm thanh. Kiểm tra lịch chờ mỗi 5 giây, lịch chưa báo sẽ reo từng nhịp tối đa 30 giây. Có nút tắt; xác nhận lịch cũng tắt chuông. Các lịch đến trong cùng đợt reo không kéo dài thời gian. Lịch đã báo được nhớ trong session của tab, theo salon. Hai tab owner có thể cùng reo. Không có chuông khi đóng trang; trình duyệt/thiết bị ngủ có thể trì hoãn kiểm tra. Email vẫn xử lý độc lập trên backend.

Kiểm thử luồng thực: khách tạo lịch → chủ tiệm mở owner/bật chuông → kiểm tra mail tiệm → xác nhận → kiểm tra mail khách. Không gửi email thật trong unit test.
