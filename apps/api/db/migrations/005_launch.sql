-- Lanzamiento: autorización de tratamiento de datos (Ley 1581 de 2012) y vendedores invitados en la beta.
ALTER TABLE users ADD COLUMN IF NOT EXISTS legal_version TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS legal_accepted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited BOOLEAN NOT NULL DEFAULT false;

-- Datos del vendedor que exige el artículo 53 de la Ley 1480 de 2011 (portales de contacto). No se muestran en el aviso.
ALTER TABLE users ADD COLUMN IF NOT EXISTS seller_doc_type TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS seller_doc_number TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS seller_address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS seller_city TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS seller_phone TEXT;
