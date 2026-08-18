/**
 * Emite JWT de PRUEBA para los usuarios sembrados por
 * `src/database/seeders/20260818000000-seed-portal-test-fixtures.sql`.
 *
 * Existe porque los smokes que valen algo son los que se ejecutan como un usuario concreto: el
 * alcance del portal se resuelve contra `merchant_users.user_id`, así que un token genérico de
 * ADMIN no prueba nada de lo que el portal tiene que impedir. Los `sub` de aquí son exactamente
 * los `user_id` del seeder; si uno de los dos cambia, el otro deja de tener sentido.
 *
 * Uso:
 *   tsx scripts/dev/create-test-jwt.ts                # todos, formato tabla
 *   tsx scripts/dev/create-test-jwt.ts --json         # JSON, para consumir desde un script
 *   tsx scripts/dev/create-test-jwt.ts --env          # líneas `export VAR=...` para los smokes
 *   tsx scripts/dev/create-test-jwt.ts merchant-alfa  # solo ese usuario, token en crudo
 *
 * Nunca en producción: firma con `JWT_ACCESS_SECRET`, que en un entorno real es la llave que
 * autentica a TODOS los usuarios.
 */
import { sign, type SignOptions } from 'jsonwebtoken';
import { env } from '../../src/config/env';

interface TestUser {
  key: string;
  /** Variable de entorno con la que los smokes reciben este token. */
  envVar: string;
  sub: string;
  email: string;
  roles: string[];
  description: string;
}

/** Roles internos completos: es el token con el que corren los smokes de staff. */
const STAFF_ROLES = [
  'ADMIN',
  'AUDITOR',
  'COMMERCIAL_EXECUTIVE',
  'COMMERCIAL_MANAGER',
  'FINANCE',
  'LEGAL',
  'OPERATIONS',
  'COLLECTIONS',
  'ACCOUNTANT',
  'CFO',
  'TREASURY',
  'ADS_ADMIN_VIEWER',
  'ADS_ADMIN_MANAGER',
  'ADS_ADMIN_OPERATOR',
  'ADS_FINANCE',
  'ADS_AUDITOR',
  'ADS_MODERATOR',
  'ADS_COMPLIANCE_ADMIN',
  'ADS_INVENTORY_MANAGER',
  'ADS_OPS_MONITOR',
  'ADS_AD_SERVER',
  'ADS_EVENT_TRACKER',
];

const TEST_USERS: TestUser[] = [
  {
    key: 'staff-admin',
    envVar: 'ATLAS_STAFF_SMOKE_TOKEN',
    sub: '00000000-0000-0000-0000-000000000001',
    email: 'admin.b2b@atlas.local',
    roles: STAFF_ROLES,
    description: 'Staff interno con todos los roles. Consola administrativa y smokes internos.',
  },
  {
    key: 'merchant-alfa',
    envVar: 'ATLAS_PORTAL_SMOKE_TOKEN',
    sub: 'c1000000-0000-4000-8000-000000000001',
    email: 'merchant.alfa@atlas.test',
    roles: ['MERCHANT_ADMIN'],
    description: 'Usuario partner del Comercio Alfa. Es el token del smoke del portal.',
  },
  {
    key: 'merchant-beta',
    envVar: 'ATLAS_PORTAL_SMOKE_TOKEN_BETA',
    sub: 'c1000000-0000-4000-8000-000000000002',
    email: 'merchant.beta@atlas.test',
    roles: ['MERCHANT_ADMIN'],
    description: 'Usuario partner del Comercio Beta. Sirve para comprobar el aislamiento cruzado.',
  },
  {
    key: 'merchant-revocado',
    envVar: 'ATLAS_PORTAL_SMOKE_TOKEN_REVOKED',
    sub: 'c1000000-0000-4000-8000-000000000003',
    email: 'merchant.revocado@atlas.test',
    roles: ['MERCHANT_ADMIN'],
    description:
      'Membresía SUSPENDED: token válido y con el rol correcto, pero sin acceso a nada (fail-closed).',
  },
];

function issue(user: TestUser): string {
  return sign(
    { sub: user.sub, email: user.email, roles: user.roles, roleCode: user.roles[0] },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'] },
  );
}

function main(): void {
  if (env.NODE_ENV === 'production') {
    throw new Error('create-test-jwt no se ejecuta en producción: firma tokens de usuarios falsos.');
  }

  const args = process.argv.slice(2);
  const flags = new Set(args.filter((arg) => arg.startsWith('--')));
  const requestedKey = args.find((arg) => !arg.startsWith('--'));

  if (requestedKey) {
    const user = TEST_USERS.find((candidate) => candidate.key === requestedKey);
    if (!user) {
      throw new Error(
        `Usuario de prueba desconocido: ${requestedKey}. Disponibles: ${TEST_USERS.map((u) => u.key).join(', ')}`,
      );
    }
    process.stdout.write(`${issue(user)}\n`);
    return;
  }

  const issued = TEST_USERS.map((user) => ({ ...user, token: issue(user) }));

  if (flags.has('--json')) {
    process.stdout.write(`${JSON.stringify(issued, null, 2)}\n`);
    return;
  }

  if (flags.has('--env')) {
    for (const user of issued) {
      process.stdout.write(`export ${user.envVar}='${user.token}'\n`);
    }
    return;
  }

  for (const user of issued) {
    process.stdout.write(
      [
        `# ${user.key} — ${user.description}`,
        `  email : ${user.email}`,
        `  sub   : ${user.sub}`,
        `  roles : ${user.roles.join(', ')}`,
        `  env   : ${user.envVar}`,
        `  token : ${user.token}`,
        '',
      ].join('\n'),
    );
  }
}

main();
