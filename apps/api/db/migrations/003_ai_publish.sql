-- Publicación asistida con IA: fotos procesadas, borradores y videos para redes.

-- Cada foto subida, ya procesada (sin EXIF/GPS) y con sus medidas de calidad.
CREATE TABLE IF NOT EXISTS uploads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url         TEXT UNIQUE NOT NULL,
  width       INT NOT NULL,
  height      INT NOT NULL,
  quality     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS uploads_user ON uploads (user_id, created_at DESC);

-- Borrador del aviso: guarda fotos, reconocimiento, confirmación, texto y la conversación con la IA.
CREATE TABLE IF NOT EXISTS listing_drafts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data        JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listing_drafts_user ON listing_drafts (user_id, updated_at DESC);

-- Video vertical para redes de cada aviso.
CREATE TABLE IF NOT EXISTS listing_videos (
  listing_id  UUID PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('en_proceso','listo','error')),
  url         TEXT,
  poster_url  TEXT,
  error       TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
