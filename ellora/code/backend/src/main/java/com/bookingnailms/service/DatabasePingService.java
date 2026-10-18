package com.bookingnailms.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import javax.sql.DataSource;
import java.sql.SQLException;
import java.util.concurrent.locks.ReentrantLock;

@Service @RequiredArgsConstructor
public class DatabasePingService {
    private final DataSource dataSource;
    private final ReentrantLock probe = new ReentrantLock();
    public record Result(String status, long latencyMs) {
        public boolean ready() { return "UP".equals(status); }
    }

    public Result check() {
        long started = System.nanoTime();
        if (!probe.tryLock()) return result(false,started);
        try {
            boolean ready;
            // Reuse the configured pool's acquisition timeout; the statement timeout is separate.
            try (var connection = dataSource.getConnection(); var statement = connection.createStatement()) {
                statement.setQueryTimeout(3);
                try (var rows = statement.executeQuery("SELECT 1")) {
                    ready = rows.next() && rows.getInt(1) == 1;
                }
            }
            return result(ready,started);
        } catch (SQLException | RuntimeException unavailable) {
            return result(false,started);
        } finally {
            probe.unlock();
        }
    }

    private Result result(boolean ready, long started) {
        return new Result(ready ? "UP" : "DOWN",Math.max(0,(System.nanoTime()-started)/1_000_000));
    }
}
