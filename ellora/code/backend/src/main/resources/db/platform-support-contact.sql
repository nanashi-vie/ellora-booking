-- Apply before deploying this feature to Supabase (ddl-auto: none).
CREATE TABLE IF NOT EXISTS platform_support_contacts (
    id BIGINT PRIMARY KEY CHECK (id = 1),
    email VARCHAR(254) NOT NULL DEFAULT '',
    phone VARCHAR(30) NOT NULL DEFAULT '',
    facebook_url VARCHAR(500) NOT NULL DEFAULT ''
);
