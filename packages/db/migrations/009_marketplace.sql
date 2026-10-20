-- Klonlar marketpleysi: egasi klonni ommaviy katalogga qo'yadi, obunachilar baholaydi, admin moderatsiya qiladi.
ALTER TABLE clones ADD COLUMN listed boolean NOT NULL DEFAULT false;
ALTER TABLE clones ADD COLUMN category text CHECK (category IN ('education', 'business', 'health', 'beauty', 'tech', 'creative', 'sport', 'other'));
ALTER TABLE clones ADD COLUMN tagline text NOT NULL DEFAULT '';
-- Admin bloklagan klon katalogda ko'rinmaydi (klonning o'zi ishlashda davom etadi).
ALTER TABLE clones ADD COLUMN moderation text NOT NULL DEFAULT 'ok' CHECK (moderation IN ('ok', 'blocked'));
ALTER TABLE clones ADD COLUMN moderation_reason text;
CREATE INDEX clones_listed ON clones (category) WHERE listed AND moderation = 'ok';

-- Obunachi bitta xabarga bir marta ovoz beradi (qayta bossa — o'zgartiriladi).
CREATE UNIQUE INDEX feedback_end_user_once ON feedback (message_id) WHERE by_role = 'end_user';

-- Shikoyatlar (soxta shaxs, zararli maslahat va h.k.) — faqat admin ko'radi.
CREATE TABLE marketplace_reports (
  id bigserial PRIMARY KEY,
  clone_id uuid NOT NULL REFERENCES clones (id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('impersonation', 'harmful', 'spam', 'other')),
  details text NOT NULL DEFAULT '',
  reporter text NOT NULL,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clone_id, reporter)
);
