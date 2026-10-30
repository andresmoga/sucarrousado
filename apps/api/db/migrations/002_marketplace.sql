-- Capa gratis del marketplace: cuentas, avisos completos, fotos, preguntas y favoritos.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS name          TEXT,
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp      TEXT;

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS doors INT;

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS estimate_id     UUID REFERENCES price_estimates(id),
  ADD COLUMN IF NOT EXISTS condition_score INT CHECK (condition_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS features        TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS views           INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ NOT NULL DEFAULT now();

-- La búsqueda de texto se calcula sola a partir del título y la descripción.
ALTER TABLE listings DROP COLUMN IF EXISTS search;
ALTER TABLE listings ADD COLUMN search TSVECTOR
  GENERATED ALWAYS AS (
    setweight(to_tsvector('spanish', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(description, '')), 'B')
  ) STORED;
CREATE INDEX IF NOT EXISTS listings_search ON listings USING GIN (search);
CREATE INDEX IF NOT EXISTS listings_price ON listings (price_cop) WHERE status = 'activo';
CREATE INDEX IF NOT EXISTS listings_created ON listings (created_at DESC) WHERE status = 'activo';
CREATE INDEX IF NOT EXISTS listings_seller ON listings (seller_id);

CREATE TABLE IF NOT EXISTS listing_photos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  slot        TEXT NOT NULL,
  position    INT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listing_photos_listing ON listing_photos (listing_id, position);

CREATE TABLE IF NOT EXISTS questions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id   UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  asker_id     UUID NOT NULL REFERENCES users(id),
  body         TEXT NOT NULL CHECK (char_length(body) BETWEEN 5 AND 500),
  answer       TEXT CHECK (answer IS NULL OR char_length(answer) BETWEEN 1 AND 1000),
  answered_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS questions_listing ON questions (listing_id, created_at DESC);

CREATE TABLE IF NOT EXISTS favorites (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id  UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);

ALTER TABLE condition_reports
  ALTER COLUMN listing_id DROP NOT NULL;
