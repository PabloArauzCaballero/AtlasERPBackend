-- Quitar la instantánea borra la tasa con la que se cobró cada compra: es un hecho financiero.
-- Por eso el `down` sólo retira la restricción y deja las columnas y sus datos.
ALTER TABLE atlas_sales.bnpl_purchases DROP CONSTRAINT IF EXISTS ck_bnpl_purchases_mdr_snapshot;
