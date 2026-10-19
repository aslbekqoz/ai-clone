-- Har bir klonning o'z Telegram boti (04-hujjat §9, v1): token shifrlangan holda saqlanadi,
-- yangilanishlar bitta serverga webhook orqali keladi: POST /telegram/<id>.

CREATE TABLE telegram_bots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  clone_id      uuid NOT NULL UNIQUE REFERENCES clones (id) ON DELETE CASCADE,
  -- Bitta bot faqat bitta klonga ulanadi.
  bot_id        bigint NOT NULL UNIQUE,
  bot_username  text NOT NULL,
  bot_info      jsonb NOT NULL,
  -- AES-256-GCM (CHANNEL_SECRET_KEY): "v1:<iv>:<tag>:<ciphertext>" base64.
  token_enc     text NOT NULL,
  webhook_secret text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE telegram_bots ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON telegram_bots USING (tenant_id = current_tenant());
-- Ilova roli faqat token va sirsiz ustunlarni o'qiydi; webhook marshrutlash ega roli bilan.
GRANT SELECT (id, tenant_id, clone_id, bot_id, bot_username, created_at) ON telegram_bots TO aiclone_app;
