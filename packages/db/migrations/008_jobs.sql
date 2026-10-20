-- Fon vazifalari navbati: webhook yangilanishlari (Telegram, Meta) va og'ir ingest (YouTube, OCR).
-- Worker'lar vazifani FOR UPDATE SKIP LOCKED bilan oladi; xatoda eksponensial kechikish bilan qayta urinadi.
-- Tizim jadvali: ilova roli (aiclone_app) unga kira olmaydi, tenant faqat API orqali o'z vazifasini ko'radi.
CREATE TABLE jobs (
  id bigserial PRIMARY KEY,
  queue text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  -- Katta ikkilik ma'lumot (OCR uchun fayl). Vazifa tugagach tozalanadi.
  blob bytea,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed')),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  run_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  -- Takroriy yetkazishni bitta vazifaga aylantiradi (masalan, Telegram update_id).
  singleton_key text,
  -- Bir guruh (masalan, bitta foydalanuvchi bilan suhbat) vazifalari navbat tartibida, bittadan bajariladi.
  group_key text,
  result jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE UNIQUE INDEX jobs_singleton ON jobs (singleton_key) WHERE singleton_key IS NOT NULL;
CREATE INDEX jobs_ready ON jobs (run_at, id) WHERE status = 'queued';
CREATE INDEX jobs_group_open ON jobs (group_key, id) WHERE group_key IS NOT NULL AND status IN ('queued', 'running');
CREATE INDEX jobs_finished ON jobs (finished_at) WHERE status IN ('done', 'failed');
