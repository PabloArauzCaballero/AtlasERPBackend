-- Los segmentos comerciales del ERP, y a QUIEN agrupa cada uno.
--
-- El ERP tenia una sola cosa llamada «segmento» —`ad_target_segments`, la audiencia publicitaria—
-- y tres poblaciones que no se parecen en nada: el usuario ERP (`internal_users`), el partner
-- (`b2b_accounts`) y el cliente que solicita credito y compra a plazos (`consumers_ref`). Como en
-- el menu las tres se leian como «usuarios», la pantalla de Seguridad y la de Segmentos parecian
-- dos vistas de lo mismo. No lo son: el usuario ERP no se segmenta, se administra —tiene rol y
-- permisos, no poblacion—; el partner y el solicitante si se segmentan, y por criterios distintos.
--
-- `subject` es lo que cierra el equivoco, y es una columna y no un comentario porque un segmento
-- del que no consta a quien cuenta no se puede evaluar: los atributos admitidos son otros segun el
-- sujeto, y el mismo JSON contaria dos poblaciones distintas.
--
-- `owner_user_id` es el UNICO punto donde un usuario ERP toca un segmento: como responsable de
-- mantenerlo. Nunca como miembro.
--
-- La definicion es JSONB por lo mismo que en publicidad —una regla es un arbol, no una columna—,
-- pero NO es texto libre: el vocabulario admisible vive en `domain/crm-segments.ts` y se valida en
-- el borde. Un atributo que no este alli es un error de alta, no una sorpresa al contar.

CREATE TABLE IF NOT EXISTS atlas_sales.crm_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- A quien agrupa. CREDIT_APPLICANT mira comportamiento de credito; PARTNER mira la cuenta B2B.
  subject varchar(30) NOT NULL,
  name varchar(140) NOT NULL,
  description text,
  definition_json jsonb NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'ACTIVE',
  -- Quien lo mantiene. Es un usuario ERP, y esa es toda su relacion con el segmento.
  owner_user_id uuid REFERENCES atlas_sales.internal_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_crm_segments_subject CHECK (subject IN ('CREDIT_APPLICANT', 'PARTNER')),
  CONSTRAINT ck_crm_segments_status CHECK (status IN ('ACTIVE', 'INACTIVE')),
  -- El nombre se repite entre sujetos pero no dentro de uno: «Mora temprana» puede existir para
  -- solicitantes y para partners, y siguen siendo dos catalogos separados.
  CONSTRAINT uq_crm_segments_subject_name UNIQUE (subject, name)
);

CREATE INDEX IF NOT EXISTS idx_crm_segments_subject
  ON atlas_sales.crm_segments (subject, status);
