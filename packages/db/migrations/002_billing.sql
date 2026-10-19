-- Tarif obunalari: buyurtmalar va Payme/Click tranzaksiyalari (05-hujjat, tariflar).
-- To'lov tizimlari webhooklari tenant kontekstisiz keladi, shuning uchun tranzaksiya
-- jadvallari ilova roliga ochilmaydi — ular faqat ega roli bilan (BillingService) ishlaydi.

ALTER TABLE tenants ADD COLUMN plan_expires_at timestamptz;

CREATE TABLE orders (
  id            bigserial PRIMARY KEY,
  tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  plan          text NOT NULL CHECK (plan IN ('creator', 'pro', 'business')),
  months        integer NOT NULL CHECK (months BETWEEN 1 AND 12),
  amount_tiyin  bigint NOT NULL CHECK (amount_tiyin > 0),
  provider      text NOT NULL CHECK (provider IN ('payme', 'click')),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled', 'refunded')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  paid_at       timestamptz
);
CREATE INDEX orders_tenant ON orders (tenant_id, created_at DESC);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON orders USING (tenant_id = current_tenant());
GRANT SELECT ON orders TO aiclone_app;

-- Payme Merchant API: state 1 — yaratilgan, 2 — o'tkazilgan, -1 — o'tkazishdan oldin bekor,
-- -2 — o'tkazilgandan keyin bekor. Vaqtlar millisekundda (Payme formati).
CREATE TABLE payme_transactions (
  id            text PRIMARY KEY,
  order_id      bigint NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  amount_tiyin  bigint NOT NULL,
  state         smallint NOT NULL,
  reason        smallint,
  payme_time    bigint NOT NULL,
  create_time   bigint NOT NULL,
  perform_time  bigint NOT NULL DEFAULT 0,
  cancel_time   bigint NOT NULL DEFAULT 0
);
CREATE INDEX payme_transactions_order ON payme_transactions (order_id);
CREATE INDEX payme_transactions_time ON payme_transactions (payme_time);

CREATE TABLE click_transactions (
  prepare_id    bigserial PRIMARY KEY,
  click_trans_id bigint NOT NULL UNIQUE,
  order_id      bigint NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  amount_uzs    numeric(14, 2) NOT NULL,
  status        text NOT NULL CHECK (status IN ('prepared', 'completed', 'cancelled')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz
);
