# Font của Ellora

Tất cả file font dùng trong ứng dụng được lưu tại đây:

- `minion-pro/`: Minion Pro cho tiêu đề, gồm các weight 400/500/600/700, normal và italic. Đây là bộ font đã có sẵn trong dự án.
- `inter/`: Inter 5.3.0 từ `@fontsource-variable/inter`, weight 100–900, normal và italic; có các subset Latin, Latin Extended và Vietnamese. Giữ giấy phép OFL-1.1 tại [`inter/LICENSE`](inter/LICENSE).

Khai báo `@font-face`, `font-display: swap`, `--font-serif` và `--font-sans` tập trung trong [`src/styles/fonts.css`](../../src/styles/fonts.css). Tailwind và các component dùng chung hai biến này.

Không sao chép font vào `docs`. Không dùng lại CSS/demo sinh sẵn với tên family khác cấu hình ứng dụng.
