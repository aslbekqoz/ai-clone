-- White-label (Business tarifi): klon sahifasi va vidjetda o'z brendi, "AI Clone" havolasini yashirish va o'z domeni.
-- AI oshkoraligi ("javoblar AI tomonidan") har doim ko'rinadi — u brending emas, qonuniy talab.
ALTER TABLE clones ADD COLUMN brand jsonb NOT NULL DEFAULT '{}';

-- Klonning o'z domeni (masalan, ai.dilnoza.uz). Egalik DNS TXT yozuvi bilan tasdiqlanadi;
-- TLS sertifikati faqat tasdiqlangan domen uchun chiqariladi (Caddy on-demand TLS "ask").
CREATE TABLE custom_domains (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  clone_id      uuid NOT NULL UNIQUE REFERENCES clones (id) ON DELETE CASCADE,
  domain        text NOT NULL UNIQUE,
  verify_token  text NOT NULL,
  verified_at   timestamptz,
  checked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE custom_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_domains FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON custom_domains USING (tenant_id = current_tenant()) WITH CHECK (tenant_id = current_tenant());
DO $$ BEGIN EXECUTE format('CREATE POLICY system_owner ON custom_domains TO %I USING (true) WITH CHECK (true)', current_user); END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON custom_domains TO aiclone_app;
