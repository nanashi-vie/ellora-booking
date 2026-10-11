package com.bookingnailms.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class BookingEmailTemplateTest {
    @Test void escapesDynamicContentAndKeepsBillingInstructions() {
        String html = BookingEmailTemplate.render("BILLING_REMINDER",
                "Tiệm <script>alert('x')</script>\nSố tiền: 100000 VNĐ\nNội dung chuyển khoản: ELLORA 2 202610");
        assertFalse(html.contains("<script>"));
        assertTrue(html.contains("&lt;script&gt;"));
        assertTrue(html.contains("Nhắc thanh toán phí nền tảng"));
        assertTrue(html.contains("100000 VNĐ"));
        assertTrue(html.contains("ELLORA 2 202610"));
    }

    @Test void distinguishesBookingNotifications() {
        assertTrue(BookingEmailTemplate.render("NEW_BOOKING", "Khách hàng: Linh")
                .contains("Bạn có lịch hẹn mới"));
        assertTrue(BookingEmailTemplate.render("CONFIRMED", "Thời gian: 09:30 01/10/2026")
                .contains("Lịch hẹn đã được xác nhận"));
    }
}
