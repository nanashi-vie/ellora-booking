package com.bookingnailms.controller;

import com.bookingnailms.dto.common.ApiResponse;
import com.bookingnailms.service.DatabasePingService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController @RequiredArgsConstructor
public class DatabasePingController {
    private final DatabasePingService database;

    @GetMapping("/ping/db")
    public ResponseEntity<ApiResponse<DatabasePingService.Result>> pingDatabase() {
        var result = database.check();
        var body = ApiResponse.<DatabasePingService.Result>builder().success(result.ready()).data(result)
                .message(result.ready() ? "Database ready" : "Database unavailable").build();
        return ResponseEntity.status(result.ready() ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
                .cacheControl(CacheControl.noStore()).body(body);
    }
}
