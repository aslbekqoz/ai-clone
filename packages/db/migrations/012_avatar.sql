-- Video-avatar (14-qadam): egasining surati + klonlangan ovozi → gapiruvchi video javob.
-- Surat va rozilik — biometrik ma'lumot: faqat shu bazada saqlanadi, ilova roli ularni o'qiy olmaydi.
-- Provayderga (D-ID) surat har bir video uchun vaqtinchalik yuklanadi, tayyor video yuklab olingach o'chiriladi.
ALTER TABLE clones ADD COLUMN avatar_mode text NOT NULL DEFAULT 'off' CHECK (avatar_mode IN ('off', 'always'));

CREATE TABLE avatar_profiles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  clone_id          uuid NOT NULL UNIQUE REFERENCES clones (id) ON DELETE CASCADE,
  photo             bytea NOT NULL,
  photo_mime        text NOT NULL CHECK (photo_mime IN ('image/jpeg', 'image/png')),
  -- Egasi o'qib, to'liq ismini yozib tasdiqlagan rozilik matni.
  consent_text      text NOT NULL,
  consent_signature text NOT NULL,
  consent_ip        text,
  provider          text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE avatar_renders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  clone_id        uuid NOT NULL REFERENCES clones (id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations (id) ON DELETE CASCADE,
  channel         text NOT NULL CHECK (channel IN ('web', 'telegram')),
  -- Kimga: vidjet tashrifchisi ID'si yoki Telegram chat ID'si.
  recipient       text NOT NULL,
  text            text NOT NULL,
  status          text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'rendering', 'done', 'failed')),
  talk_id         text,
  seconds         numeric(8, 2) NOT NULL DEFAULT 0,
  video           bytea,
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz
);
CREATE INDEX avatar_renders_usage ON avatar_renders (tenant_id, created_at) WHERE status = 'done';

ALTER TABLE avatar_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON avatar_profiles USING (tenant_id = current_tenant());
GRANT SELECT (id, tenant_id, clone_id, provider, created_at) ON avatar_profiles TO aiclone_app;

ALTER TABLE avatar_renders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON avatar_renders USING (tenant_id = current_tenant());
GRANT SELECT (id, tenant_id, clone_id, channel, status, seconds, created_at, finished_at) ON avatar_renders TO aiclone_app;
