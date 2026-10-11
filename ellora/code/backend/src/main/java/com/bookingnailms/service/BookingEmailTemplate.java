package com.bookingnailms.service;

import org.springframework.web.util.HtmlUtils;

final class BookingEmailTemplate {
    private BookingEmailTemplate() {}

    static String render(String kind, String body) {
        String title = switch (kind == null ? "" : kind) {
            case "CONFIRMED" -> "Lịch hẹn đã được xác nhận";
            case "BILLING_REMINDER" -> "Nhắc thanh toán phí nền tảng";
            default -> "Bạn có lịch hẹn mới";
        };
        StringBuilder details = new StringBuilder();
        for (String line : (body == null ? "" : body).split("\\R")) {
            if (line.isBlank()) continue;
            int colon = line.indexOf(':');
            String content = colon > 0
                    ? "<strong style=\"color:#684453\">" + HtmlUtils.htmlEscape(line.substring(0, colon + 1))
                            + "</strong> " + HtmlUtils.htmlEscape(line.substring(colon + 1))
                    : HtmlUtils.htmlEscape(line);
            details.append("<tr><td style=\"padding:10px 0;border-bottom:1px solid #f5e7ed;font-size:15px;line-height:1.7;word-break:break-word\">")
                    .append(content).append("</td></tr>");
        }
        return """
                <!doctype html>
                <html lang="vi"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
                <body style="margin:0;padding:0;background:#fff5f8;color:#40343a;font-family:Arial,Helvetica,sans-serif">
                <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background:#fff5f8"><tr><td align="center" style="padding:28px 12px">
                <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #f1dce5;border-radius:20px;overflow:hidden">
                <tr><td style="padding:30px 24px;background:#f7bcd5;color:#593343">
                <div style="font-family:Georgia,serif;font-size:36px;letter-spacing:2px">Ellora</div>
                <div style="margin-top:8px;font-size:13px;line-height:1.6">Một chút chăm sóc, thêm nhiều yêu thương.</div></td></tr>
                <tr><td style="padding:28px 24px">
                <h1 style="margin:0 0 20px;font-size:24px;line-height:1.4;color:#593343">%s</h1>
                <table role="presentation" width="100%%" cellspacing="0" cellpadding="0">%s</table>
                <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#765e69">Cảm ơn bạn đã đồng hành cùng Ellora.</p></td></tr>
                <tr><td style="padding:20px 24px;background:#fff9fb;border-top:1px solid #f5e7ed;font-size:12px;line-height:1.7;color:#765e69">Ellora · Nền tảng đặt lịch làm đẹp<br>Email thông báo tự động từ Ellora.</td></tr>
                </table></td></tr></table></body></html>
                """.formatted(title, details);
    }
}
