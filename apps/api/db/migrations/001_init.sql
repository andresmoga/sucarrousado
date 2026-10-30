-- Esquema inicial de TuCarroUsado.
-- Placas guardadas como hash (Ley 1581 de 2012); dinero en pesos (BIGINT).

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  phone       TEXT,
  kind        TEXT NOT NULL DEFAULT 'particular' CHECK (kind IN ('particular','profesional')),
  kyc_status  TEXT NOT NULL DEFAULT 'pendiente' CHECK (kyc_status IN ('pendiente','verificado','rechazado')),
  reputation  NUMERIC(3,2),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_hash      TEXT UNIQUE NOT NULL,
  fasecolda_code  TEXT,
  brand           TEXT NOT NULL,
  line            TEXT NOT NULL,
  version         TEXT,
  model_year      INT NOT NULL,
  fuel            TEXT,
  transmission    TEXT,
  body_type       TEXT,
  color           TEXT,
  armored         BOOLEAN NOT NULL DEFAULT false,
  runt_snapshot   JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vehicles_brand_line_year ON vehicles (brand, line, model_year);

CREATE TABLE IF NOT EXISTS listings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id   UUID NOT NULL REFERENCES users(id),
  vehicle_id  UUID NOT NULL REFERENCES vehicles(id),
  title       TEXT NOT NULL,
  description TEXT,
  price_cop   BIGINT NOT NULL CHECK (price_cop > 0),
  km          INT NOT NULL CHECK (km >= 0),
  city        TEXT NOT NULL,
  plan        TEXT NOT NULL DEFAULT 'gratis' CHECK (plan IN ('gratis','verificado','ganga','subasta')),
  status      TEXT NOT NULL DEFAULT 'activo' CHECK (status IN ('borrador','activo','pausado','vendido','vencido')),
  expires_at  TIMESTAMPTZ,
  search      TSVECTOR,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listings_status ON listings (status);
CREATE INDEX IF NOT EXISTS listings_search ON listings USING GIN (search);

CREATE TABLE IF NOT EXISTS condition_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id  UUID REFERENCES listings(id),
  score       INT NOT NULL CHECK (score BETWEEN 0 AND 100),
  paint       INT, mechanics INT, interior INT, tires INT, history INT, docs INT,
  evidence    TEXT NOT NULL CHECK (evidence IN ('declarado','fotos_ia','inspeccion')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cada tasación (también las de la landing, sin aviso) queda guardada:
-- sirve de lead y de dato para calibrar el modelo.
CREATE TABLE IF NOT EXISTS price_estimates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id       UUID REFERENCES listings(id),
  vehicle_id       UUID REFERENCES vehicles(id),
  km               INT NOT NULL,
  city             TEXT NOT NULL,
  condition_score  INT NOT NULL,
  fasecolda_value  BIGINT NOT NULL,
  market_median    BIGINT,
  comparables      INT NOT NULL,
  low              BIGINT NOT NULL,
  mid              BIGINT NOT NULL,
  high             BIGINT NOT NULL,
  adjustments      JSONB NOT NULL,
  model_version    TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS waitlist (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT UNIQUE NOT NULL,
  estimate_id  UUID REFERENCES price_estimates(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auctions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  starts_at  TIMESTAMPTZ NOT NULL,
  room_url   TEXT,
  status     TEXT NOT NULL DEFAULT 'programada' CHECK (status IN ('programada','en_vivo','cerrada','cancelada'))
);

CREATE TABLE IF NOT EXISTS auction_lots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id   UUID NOT NULL REFERENCES auctions(id),
  listing_id   UUID NOT NULL REFERENCES listings(id),
  reserve_cop  BIGINT NOT NULL,
  hammer_cop   BIGINT
);

CREATE TABLE IF NOT EXISTS bids (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id      UUID NOT NULL REFERENCES auction_lots(id),
  bidder_id   UUID NOT NULL REFERENCES users(id),
  amount_cop  BIGINT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bids_lot_amount ON bids (lot_id, amount_cop DESC);

CREATE TABLE IF NOT EXISTS deals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id        UUID NOT NULL REFERENCES listings(id),
  buyer_id          UUID NOT NULL REFERENCES users(id),
  seller_id         UUID NOT NULL REFERENCES users(id),
  price_cop         BIGINT NOT NULL,
  arras_cop         BIGINT NOT NULL,
  arras_type        TEXT NOT NULL DEFAULT 'retractacion' CHECK (arras_type IN ('retractacion','confirmatorias','confirmatorias_penales')),
  retract_deadline  DATE NOT NULL,
  escrow_ref        TEXT,
  contract_pdf_url  TEXT,
  status            TEXT NOT NULL DEFAULT 'firmado'
                    CHECK (status IN ('firmado','arras_depositadas','saldo_pagado','traspaso_radicado','cerrado','retractado')),
  commission_cop    BIGINT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
