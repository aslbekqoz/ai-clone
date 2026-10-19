-- Klon monetizatsiyasi (05-hujjat): obunachilar klonga pullik kirish oladi, platforma 12% komissiya.
-- Obunachi buyurtmalari mavjud orders jadvalida (kind = 'fan') — Payme/Click ishlovchilari bir xil.

ALTER TABLE clones ADD COLUMN paywall_enabled boolean NOT NULL DEFAULT false;
-- Har bir obunachi oyiga shuncha bepul savol beradi, keyin to'lov taklif qilinadi.
ALTER TABLE clones ADD COLUMN paywall_free_messages integer NOT NULL DEFAULT 5 CHECK (paywall_free_messages BETWEEN 0 AND 1000);

CREATE TABLE products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  clone_id      uuid NOT NULL REFERENCES clones (id) ON DELETE CASCADE,
  title         text NOT NULL,
  -- pack: N ta savol; subscription: D kun cheksiz.
  kind          text NOT NULL CHECK (kind IN ('pack', 'subscription')),
  messages      integer CHECK (messages > 0),
  days          integer CHECK (days > 0),
  price_uzs     integer NOT NULL CHECK (price_uzs >= 1000),
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'pack' AND messages IS NOT NULL) OR (kind = 'subscription' AND days IS NOT NULL))
);
CREATE INDEX products_clone ON products (clone_id);

ALTER TABLE orders ALTER COLUMN plan DROP NOT NULL;
ALTER TABLE orders ALTER COLUMN months DROP NOT NULL;
ALTER TABLE orders ADD COLUMN kind text NOT NULL DEFAULT 'plan' CHECK (kind IN ('plan', 'fan'));
ALTER TABLE orders ADD COLUMN product_id uuid REFERENCES products (id);
ALTER TABLE orders ADD COLUMN end_user_id uuid REFERENCES end_users (id) ON DELETE SET NULL;
ALTER TABLE orders ADD CONSTRAINT orders_kind_fields CHECK (
  (kind = 'plan' AND plan IS NOT NULL AND months IS NOT NULL) OR (kind = 'fan' AND product_id IS NOT NULL)
);

CREATE TABLE entitlements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  clone_id      uuid NOT NULL REFERENCES clones (id) ON DELETE CASCADE,
  end_user_id   uuid NOT NULL REFERENCES end_users (id) ON DELETE CASCADE,
  order_id      bigint NOT NULL UNIQUE REFERENCES orders (id),
  remaining_messages integer,
  expires_at    timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX entitlements_user ON entitlements (end_user_id);

-- Kreator daromadi: har bir to'lov (+) va qaytarish (−) yozuvi. Balans = sum(net) − sum(payouts).
CREATE TABLE creator_earnings (
  id            bigserial PRIMARY KEY,
  tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  order_id      bigint NOT NULL REFERENCES orders (id),
  gross_tiyin   bigint NOT NULL,
  commission_tiyin bigint NOT NULL,
  net_tiyin     bigint NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX creator_earnings_tenant ON creator_earnings (tenant_id);

CREATE TABLE payouts (
  id            bigserial PRIMARY KEY,
  tenant_id     uuid NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  amount_tiyin  bigint NOT NULL CHECK (amount_tiyin > 0),
  reference     text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['products', 'entitlements', 'creator_earnings', 'payouts'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_tenant()) WITH CHECK (tenant_id = current_tenant())', t);
  END LOOP;
END $$;
GRANT SELECT, INSERT, UPDATE ON products TO aiclone_app;
GRANT SELECT ON entitlements, creator_earnings, payouts TO aiclone_app;
