-- Membresía de comercio de DESARROLLO para las dos identidades de partner de AtlasBackend.
--
-- Por qué existe. Atlas parte la identidad del comercio en dos bases a propósito: quién es y cómo
-- inicia sesión vive en AtlasBackend (`iam.merchant_users`); a QUÉ comercio pertenece y con qué
-- alcance vive aquí (`atlas_sales.merchant_users`). El enlace es `user_id`, que guarda como texto el
-- `sub` del token, es decir el `_id` de la identidad.
--
-- Sin la fila de este lado, esas identidades entran al portal y `PortalScopeService` deniega todo —
-- es fail-closed a propósito: sin membresía comprobable, un comercio no ve nada. El síntoma es un
-- portal que se abre y falla endpoint por endpoint, que se lee como una avería y no como lo que es.
--
-- Los `user_id` '9001' y '9002' son los identificadores fijos que siembra
-- `AtlasBackend/src/database/seeders/development/20260821140000-seed-partners-desarrollo.ts`. Si
-- allí cambian, aquí también.
--
-- Idempotente. NO ejecutar en producción: son cuentas con contraseña conocida.

-- `category` y `business_line` son NOT NULL desde que la cuenta B2B pasó a describir el negocio
-- (y no solo a nombrarlo). Sin ellas este seed moría con «null value in column "category"» y las dos
-- identidades de partner se quedaban sin membresía: el portal se abría y denegaba todo.
INSERT INTO atlas_sales.b2b_accounts
  (id, legal_name, trade_name, tax_id, account_type, industry, lifecycle_status,
   category, business_line, city, country_code)
VALUES
  ('a9000000-0000-4000-8000-000000009001', 'Centro de Preparacion Academica CPA SRL',
   'CPA Centro Preparacion Academica', 'DEV-PARTNER-CPA-001', 'MERCHANT', 'EDUCATION', 'CUSTOMER',
   'EDUCACION', 'Preparacion academica preuniversitaria', 'Santa Cruz de la Sierra', 'BO'),
  ('a9000000-0000-4000-8000-000000009002', 'Pabliarca Comercio SRL',
   'Pabliarca', 'DEV-PARTNER-PABLIARCA-002', 'MERCHANT', 'RETAIL', 'CUSTOMER',
   'RETAIL', 'Venta de electrodomesticos y tecnologia', 'Santa Cruz de la Sierra', 'BO')
ON CONFLICT (id) DO NOTHING;

INSERT INTO atlas_sales.merchant_branches
  (id, account_id, name, city, address, status, can_originate_bnpl, activated_at)
VALUES
  ('d9000000-0000-4000-8000-000000009001', 'a9000000-0000-4000-8000-000000009001',
   'CPA Casa Matriz', 'Santa Cruz de la Sierra', 'Sucursal de desarrollo', 'ACTIVE', true, now()),
  ('d9000000-0000-4000-8000-000000009002', 'a9000000-0000-4000-8000-000000009002',
   'Pabliarca Casa Matriz', 'Santa Cruz de la Sierra', 'Sucursal de desarrollo', 'ACTIVE', true, now())
ON CONFLICT (id) DO NOTHING;

-- `ACTIVE` y `MERCHANT_ADMIN`: la membresía nace `INVITED`, que es lo correcto para un alta real y
-- deja la cuenta sin alcance hasta que alguien la acepte. Una cuenta de desarrollo tiene que servir
-- desde la primera ejecución.
INSERT INTO atlas_sales.merchant_users
  (id, account_id, branch_id, email, full_name, role_code, status, user_id)
VALUES
  ('b9000000-0000-4000-8000-000000009001', 'a9000000-0000-4000-8000-000000009001',
   'd9000000-0000-4000-8000-000000009001', 'cpacentropreparacionacademica@gmail.com',
   'CPA Centro Preparacion Academica', 'MERCHANT_ADMIN', 'ACTIVE', '9001'),
  ('b9000000-0000-4000-8000-000000009002', 'a9000000-0000-4000-8000-000000009002',
   'd9000000-0000-4000-8000-000000009002', 'pabliarca@gmail.com',
   'Pablo Arauz Caballero', 'MERCHANT_ADMIN', 'ACTIVE', '9002')
ON CONFLICT (id) DO UPDATE SET
  account_id = EXCLUDED.account_id,
  branch_id = EXCLUDED.branch_id,
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name,
  role_code = EXCLUDED.role_code,
  status = EXCLUDED.status,
  user_id = EXCLUDED.user_id;
