-- AI Clone — boshlang'ich sxema (04-hujjat §4).
-- Har bir tenant jadvalida tenant_id va RLS siyosati bor. Ilova so'rovlari `aiclone_app`
-- roli ostida, `app.tenant_id` sozlamasi bilan bajariladi (packages/db/src/pool.ts).

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aiclone_app') THEN
    CREATE ROLE aiclone_app NOLOGIN;
  END IF;
  -- Migratsiyani bajaruvchi (ilova ulanadigan) foydalanuvchi SET ROLE qila olishi uchun.
  EXECUTE format('GRANT aiclone_app TO %I', current_user);
END $$;
GRANT USAGE ON SCHEMA public TO aiclone_app;

CREATE OR REPLACE FUNCTION current_tenant() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;

CREATE TABLE tenants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  region        text NOT NULL DEFAULT 'uz' CHECK (region IN ('uz', 'global')),
  plan          text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'creator', 'pro', 'business', 'enterprise')),
  api_key_hash  text NOT NULL UNIQUE,
  monthly_message_limit integer NOT NULL DEFAULT 100,
  daily_spend_cap_usd numeric(10, 4) NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  slug          text NOT NULL,
  display_name  text NOT NULL,
  bio           text NOT NULL DEFAULT '',
  languages     text[] NOT NULL DEFAULT '{uz}',
  style_profile jsonb NOT NULL,
  grounded      boolean NOT NULL DEFAULT true,
  disclosure_text text NOT NULL,
  -- Egasi eskalatsiya xabarlarini oladigan Telegram chat ID'si.
  owner_telegram_chat_id bigint,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
CREATE UNIQUE INDEX clones_slug_global ON clones (slug);

CREATE TABLE sources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  clone_id      uuid NOT NULL REFERENCES clones (id) ON DELETE CASCADE,
  type          text NOT NULL CHECK (type IN ('text', 'pdf', 'doc', 'url', 'youtube', 'telegram', 'voice', 'interview')),
  title         text NOT NULL,
  uri           text,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
  content_hash  text NOT NULL,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clone_id, content_hash)
);

CREATE TABLE chunks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  clone_id      uuid NOT NULL REFERENCES clones (id) ON DELETE CASCADE,
  source_id     uuid NOT NULL REFERENCES sources (id) ON DELETE CASCADE,
  ord           integer NOT NULL,
  title         text NOT NULL,
  text_original text NOT NULL,
  text_norm     text NOT NULL,
  tsv           tsvector GENERATED ALWAYS AS (to_tsvector('simple', text_norm)) STORED,
  lang          text NOT NULL,
  locator       jsonb NOT NULL DEFAULT '{}',
  embedding     vector(1024) NOT NULL,
  embedding_model text NOT NULL
);
CREATE INDEX chunks_clone ON chunks (clone_id);
CREATE INDEX chunks_embedding ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX chunks_tsv ON chunks USING gin (tsv);
CREATE INDEX chunks_trgm ON chunks USING gin (text_norm gin_trgm_ops);

-- Uslub namunalari (Telegram javoblari, tuzatishlar, intervyu) va egasi tasdiqlagan javoblar.
CREATE TABLE exemplars (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  clone_id      uuid NOT NULL REFERENCES clones (id) ON DELETE CASCADE,
  question      text NOT NULL,
  answer        text NOT NULL,
  origin        text NOT NULL CHECK (origin IN ('telegram', 'correction', 'interview', 'manual')),
  embedding     vector(1024) NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX exemplars_clone ON exemplars (clone_id);

CREATE TABLE verified_answers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  clone_id      uuid NOT NULL REFERENCES clones (id) ON DELETE CASCADE,
  question      text NOT NULL,
  answer        text NOT NULL,
  embedding     vector(1024) NOT NULL,
  source_message_id uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verified_answers_clone ON verified_answers (clone_id);

CREATE TABLE end_users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  clone_id      uuid NOT NULL REFERENCES clones (id) ON DELETE CASCADE,
  channel       text NOT NULL CHECK (channel IN ('web', 'telegram', 'instagram', 'whatsapp', 'api')),
  external_id   text NOT NULL,
  name          text,
  phone         text,
  locale        text,
  consent_at    timestamptz,
  memory        jsonb NOT NULL DEFAULT '[]',
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clone_id, channel, external_id)
);

CREATE TABLE conversations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  clone_id      uuid NOT NULL REFERENCES clones (id) ON DELETE CASCADE,
  end_user_id   uuid NOT NULL REFERENCES end_users (id) ON DELETE CASCADE,
  mode          text NOT NULL DEFAULT 'bot' CHECK (mode IN ('bot', 'human', 'paused')),
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  last_msg_at   timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversations_clone_last ON conversations (clone_id, last_msg_at DESC);

CREATE TABLE messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('user', 'assistant', 'owner', 'system')),
  content       text NOT NULL,
  lang          text,
  citations     jsonb NOT NULL DEFAULT '[]',
  answer_source text,
  model         text,
  provider      text,
  tokens_in     integer NOT NULL DEFAULT 0,
  tokens_cached integer NOT NULL DEFAULT 0,
  tokens_out    integer NOT NULL DEFAULT 0,
  cost_usd      numeric(12, 6) NOT NULL DEFAULT 0,
  latency_ms    integer,
  confidence    real,
  flags         jsonb NOT NULL DEFAULT '{}',
  -- clock_timestamp(): bitta tranzaksiyadagi savol va javob ham to'g'ri tartiblanadi.
  created_at    timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX messages_conversation ON messages (conversation_id, created_at);

CREATE TABLE feedback (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  message_id    uuid NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
  by_role       text NOT NULL CHECK (by_role IN ('owner', 'end_user')),
  rating        smallint NOT NULL CHECK (rating IN (-1, 1)),
  correction    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE handoffs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  reasons       text[] NOT NULL,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);

CREATE TABLE leads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  clone_id      uuid NOT NULL REFERENCES clones (id) ON DELETE CASCADE,
  end_user_id   uuid NOT NULL REFERENCES end_users (id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations (id) ON DELETE SET NULL,
  phone         text,
  note          text,
  stage         text NOT NULL DEFAULT 'new' CHECK (stage IN ('new', 'contacted', 'won', 'lost')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clone_id, end_user_id)
);

-- Kunlik xarajat va hajm: billing, limitlar va marja dashboardi uchun.
CREATE TABLE usage_ledger (
  tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  day           date NOT NULL,
  messages      integer NOT NULL DEFAULT 0,
  tokens_in     bigint NOT NULL DEFAULT 0,
  tokens_out    bigint NOT NULL DEFAULT 0,
  cost_usd      numeric(12, 6) NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, day)
);

CREATE TABLE audit_log (
  id            bigserial PRIMARY KEY,
  tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  actor         text NOT NULL,
  action        text NOT NULL,
  target        text,
  at            timestamptz NOT NULL DEFAULT now()
);

-- RLS: har bir tenant jadvali faqat joriy tenant qatorlarini ko'rsatadi.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clones', 'sources', 'chunks', 'exemplars', 'verified_answers', 'end_users',
                           'conversations', 'messages', 'feedback', 'handoffs', 'leads', 'usage_ledger', 'audit_log']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_tenant()) WITH CHECK (tenant_id = current_tenant())', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO aiclone_app', t);
  END LOOP;
END $$;

-- tenants FORCE qilinmaydi: API kalit bo'yicha autentifikatsiya va tenant yaratish
-- tenant kontekstidan tashqarida, ega roli bilan bajariladi.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_self ON tenants USING (id = current_tenant());
GRANT SELECT, UPDATE ON tenants TO aiclone_app;
GRANT USAGE ON SEQUENCE audit_log_id_seq TO aiclone_app;
