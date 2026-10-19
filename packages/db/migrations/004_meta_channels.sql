-- Instagram DM va WhatsApp Cloud API kanallari (04-hujjat §9, v1). Tokenlar telegram_bots kabi
-- AES-256-GCM bilan shifrlanadi. Webhook bitta: /meta/webhook — kanal account_id bo'yicha topiladi.

CREATE TABLE meta_channels (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  clone_id      uuid NOT NULL REFERENCES clones (id) ON DELETE CASCADE,
  kind          text NOT NULL CHECK (kind IN ('instagram', 'whatsapp')),
  -- Instagram professional akkaunt ID'si (user_id) yoki WhatsApp phone_number_id.
  account_id    text NOT NULL,
  label         text NOT NULL,
  token_enc     text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, account_id),
  UNIQUE (clone_id, kind)
);

ALTER TABLE meta_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON meta_channels USING (tenant_id = current_tenant());
GRANT SELECT (id, tenant_id, clone_id, kind, account_id, label, created_at) ON meta_channels TO aiclone_app;

-- Meta webhookni qayta yuborishi mumkin: bir xabar ikki marta qayta ishlanmasligi uchun.
CREATE TABLE meta_processed_messages (
  message_id    text PRIMARY KEY,
  processed_at  timestamptz NOT NULL DEFAULT now()
);
