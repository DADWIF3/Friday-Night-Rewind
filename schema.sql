-- Friday Night Rewind — intake schema
-- One table, discriminated by `type`, so quotes, nominations and general
-- contact all land in the same queue instead of three disconnected inboxes.

CREATE TABLE IF NOT EXISTS submissions (
  id                TEXT PRIMARY KEY,
  type              TEXT NOT NULL CHECK (type IN ('preview','nomination','contact')),
  status            TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new','reviewing','quoted','in_progress','delivered','archived','spam')),

  -- who
  name              TEXT NOT NULL,
  email             TEXT NOT NULL,
  phone             TEXT,
  city              TEXT,
  contact_method    TEXT,

  -- what it's about
  nominee           TEXT,   -- nomination: the athlete/coach being nominated
  school            TEXT,
  team              TEXT,
  sport             TEXT,
  position          TEXT,
  year              TEXT,   -- free text: "1998", "1997-98 season"
  format            TEXT,   -- VHS, VHS-C, MiniDV, DVD, digital, phone
  length            TEXT,
  service_wanted    TEXT,

  -- content
  message           TEXT,   -- contact message / tape description / nomination story
  media_link        TEXT,

  -- consent. Stored as 0/1 plus the moment it was given: this is the part
  -- that matters if anyone ever disputes what they authorized.
  rights_confirmed  INTEGER NOT NULL DEFAULT 0,
  contact_ok        INTEGER NOT NULL DEFAULT 0,
  public_use_ok     INTEGER NOT NULL DEFAULT 0,
  portfolio_use_ok  INTEGER NOT NULL DEFAULT 0,
  consent_at        TEXT,
  consent_ip        TEXT,

  -- system
  source_page       TEXT,
  user_agent        TEXT,
  created_at        TEXT NOT NULL,
  notes             TEXT
);

CREATE INDEX IF NOT EXISTS idx_submissions_created ON submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_type    ON submissions (type, status);
CREATE INDEX IF NOT EXISTS idx_submissions_email   ON submissions (email);

-- Simple per-IP rate limiting window.
CREATE TABLE IF NOT EXISTS rate_limit (
  ip        TEXT PRIMARY KEY,
  count     INTEGER NOT NULL,
  window_at TEXT NOT NULL
);
