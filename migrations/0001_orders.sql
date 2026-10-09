CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  access_hash TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  provider_hash TEXT UNIQUE,
  state TEXT NOT NULL DEFAULT 'creating',
  pix_code TEXT,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  last_checked INTEGER NOT NULL DEFAULT 0,
  receipt_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_provider_hash ON orders(provider_hash);
