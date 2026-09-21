CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key TEXT UNIQUE NOT NULL,
    customer_email TEXT NOT NULL,
    product_slug TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    domain TEXT,
    activation_token TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    last_validated_at DATETIME
);

CREATE INDEX IF NOT EXISTS idx_license_key ON licenses(license_key);
CREATE INDEX IF NOT EXISTS idx_domain ON licenses(domain);
CREATE INDEX IF NOT EXISTS idx_activation_token ON licenses(activation_token);
