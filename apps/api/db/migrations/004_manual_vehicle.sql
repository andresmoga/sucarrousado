-- Placa que no aparece en el RUNT/Fasecolda: el vendedor escribe el carro y el rango sale solo del mercado.
ALTER TABLE price_estimates ALTER COLUMN fasecolda_value DROP NOT NULL;
