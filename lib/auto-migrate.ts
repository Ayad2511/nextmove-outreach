// lib/auto-migrate.ts
// Draait automatisch bij serverstart via instrumentation.ts
// Alle statements gebruiken IF NOT EXISTS — veilig om meerdere keren uit te voeren

import { Pool } from 'pg';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS leads (
  id                SERIAL PRIMARY KEY,
  first_name        TEXT,
  last_name         TEXT,
  email             TEXT UNIQUE,
  company_name      TEXT,
  instagram_handle  TEXT,
  owner_name        TEXT,
  owner_instagram   TEXT,
  owner_linkedin_url TEXT,
  linkedin_url      TEXT,
  niche             TEXT,
  source            TEXT NOT NULL DEFAULT 'apify',
  status            TEXT NOT NULL DEFAULT 'new',
  heygen_video_url  TEXT,
  heygen_video_id   TEXT,
  clay_row_id       TEXT UNIQUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Veilige kolom-toevoegingen voor bestaande databases
ALTER TABLE leads ADD COLUMN IF NOT EXISTS owner_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS owner_instagram TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS owner_linkedin_url TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS instagram_data JSONB;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS claude_observatie TEXT;

CREATE TABLE IF NOT EXISTS outreach_log (
  id              SERIAL PRIMARY KEY,
  lead_id         INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL,
  template_key    TEXT,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success         BOOLEAN NOT NULL DEFAULT FALSE,
  error_message   TEXT,
  external_id     TEXT
);

CREATE TABLE IF NOT EXISTS inbox_messages (
  id              SERIAL PRIMARY KEY,
  lead_id         INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  channel         TEXT NOT NULL,
  direction       TEXT NOT NULL,
  subject         TEXT,
  content         TEXT,
  sender_email    TEXT,
  external_id     TEXT UNIQUE,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read            BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS daily_limits (
  id          SERIAL PRIMARY KEY,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  channel     TEXT NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0,
  UNIQUE(date, channel)
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leads_updated_at ON leads;
CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_leads_status    ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_email     ON leads(email);
CREATE INDEX IF NOT EXISTS idx_outreach_lead   ON outreach_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_outreach_ch     ON outreach_log(channel, sent_at);
CREATE INDEX IF NOT EXISTS idx_inbox_lead      ON inbox_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_inbox_unread    ON inbox_messages(read, received_at DESC);
`;

export async function autoMigrate(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.warn('[migrate] DATABASE_URL niet ingesteld — schema migratie overgeslagen');
    return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
  });

  try {
    await pool.query(SCHEMA);
    console.log('[migrate] ✓ Database schema up-to-date');
  } catch (err) {
    // Niet fataal — app kan starten, maar DB acties falen pas bij gebruik
    console.error('[migrate] Schema migratie mislukt:', err);
  } finally {
    await pool.end();
  }
}
