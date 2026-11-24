CREATE TABLE signup_limits (
  key TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  PRIMARY KEY (key, expires_at)
);

CREATE INDEX signup_limits_expiry ON signup_limits (expires_at);
