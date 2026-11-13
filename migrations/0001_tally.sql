-- Quiz counter (functions/api/tally.js). One row per counter:
-- 'total', 'fighter:<slug>', 'type:<code>', 'day:<YYYY-MM-DD>' (daily cap).
CREATE TABLE IF NOT EXISTS tally (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL DEFAULT 0
);
-- Carry over the 62 quizzes the old counter recorded before the relaunch.
INSERT OR IGNORE INTO tally (key, n) VALUES ('total', 62);
