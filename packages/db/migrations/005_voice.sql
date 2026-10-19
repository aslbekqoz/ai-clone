-- Ovoz kloni (08-qadam): rozilik yozuvi va ovoz profili. Ovoz namunasi va rozilik yozuvi —
-- biometrik ma'lumot: faqat shu bazada (UZ hujayra) saqlanadi va ilova roliga ochilmaydi.

ALTER TABLE clones ADD COLUMN voice_mode text NOT NULL DEFAULT 'off' CHECK (voice_mode IN ('off', 'voice_in', 'always'));
ALTER TABLE usage_ledger ADD COLUMN tts_chars bigint NOT NULL DEFAULT 0;

CREATE TABLE voice_consents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  clone_id      uuid NOT NULL REFERENCES clones (id) ON DELETE CASCADE,
  script        text NOT NULL,
  code          text NOT NULL,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'revoked', 'expired')),
  transcript    text,
  recording     bytea,
  recording_mime text,
  ip            text,
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  verified_at   timestamptz,
  revoked_at    timestamptz
);
CREATE INDEX voice_consents_clone ON voice_consents (clone_id, created_at DESC);

CREATE TABLE voice_profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  clone_id      uuid NOT NULL UNIQUE REFERENCES clones (id) ON DELETE CASCADE,
  consent_id    uuid NOT NULL REFERENCES voice_consents (id),
  provider      text NOT NULL,
  provider_voice_id text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE voice_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON voice_consents USING (tenant_id = current_tenant());
GRANT SELECT (id, tenant_id, clone_id, status, created_at, verified_at, revoked_at, expires_at) ON voice_consents TO aiclone_app;

ALTER TABLE voice_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON voice_profiles USING (tenant_id = current_tenant());
GRANT SELECT (id, tenant_id, clone_id, provider, created_at) ON voice_profiles TO aiclone_app;
