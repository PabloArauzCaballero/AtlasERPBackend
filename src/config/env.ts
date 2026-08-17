import 'dotenv/config';
import { z } from 'zod';

const commaSeparatedList = (value: string): string[] =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const localTestingDefaultRoles = [
  'ADMIN',
  'AUDITOR',
  'COMMERCIAL_EXECUTIVE',
  'COMMERCIAL_MANAGER',
  'FINANCE',
  'LEGAL',
  'OPERATIONS',
  'COLLECTIONS',
  'MERCHANT_ADMIN',
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
].join(',');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    API_GLOBAL_PREFIX: z.string().min(1).default('api/v1'),
    GLOBAL_API_PREFIX: z.string().min(1).optional(),
    API_PREFIX: z.string().min(1).optional(),

    DATABASE_URL: z.string().min(1),
    DB_SSL: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    DB_LOGGING: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    STARTUP_SEEDS_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    STARTUP_MIGRATIONS_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),

    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ACCESS_EXPIRES_IN: z.string().min(1).default('15m'),
    JWT_INTERNAL_SECRET: z.string().min(20).optional(),
    JWT_INTERNAL_ISSUER: z.string().min(3).default('atlas-internal'),
    JWT_INTERNAL_AUDIENCE: z.string().min(3).default('atlas-ads'),

    // Gateway de identidad: AtlasBackend es la fuente de verdad de usuarios internos/roles.
    // Este backend nunca expone el token de AtlasBackend al navegador (ver auth-gateway module).
    ATLAS_IDENTITY_BASE_URL: z.string().url().default('http://localhost:3005/api/v1'),
    ATLAS_IDENTITY_TENANT_ID: z.string().min(1).default('1'),
    ATLAS_IDENTITY_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),

    AUTH_DISABLED_FOR_LOCAL_TESTING: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    AUTH_DISABLED_USER_ID: z.string().trim().uuid().default('00000000-0000-0000-0000-000000000001'),
    AUTH_DISABLED_USER_EMAIL: z.string().email().default('postman.local@atlas.test'),
    AUTH_DISABLED_ROLES: z
      .string()
      .min(1)
      .default(localTestingDefaultRoles)
      .transform(commaSeparatedList)
      .refine((roles) => roles.length > 0, {
        message: 'AUTH_DISABLED_ROLES debe contener al menos un rol.',
      }),

    CORS_ALLOWED_ORIGINS: z
      .string()
      .min(1)
      .transform(commaSeparatedList)
      .refine((origins) => origins.length > 0, {
        message: 'Debe configurar al menos un origen CORS válido.',
      }),
    BODY_LIMIT: z.string().min(1).default('1mb'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    DEFAULT_MIN_MDR_RATE_PERCENT: z.coerce.number().positive().default(2.5),
    DEFAULT_TAX_RATE_PERCENT: z.coerce.number().min(0).max(100).default(13),

    GLOBAL_ADS_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    ADS_DEFAULT_CURRENCY: z.string().length(3).default('BOB'),
    ADS_EVENT_FRAUD_SCORE_MAX_BILLABLE: z.coerce.number().min(0).max(1).default(0.8),
    ADS_BILLING_TAX_RATE: z.coerce.number().min(0).max(1).default(0),
    // Almacenamiento de archivos del ERP (Cloudinary, signed direct upload).
    // Opcionales: si no se configuran, los endpoints de /files responden 503 explícito.
    CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
    CLOUDINARY_API_KEY: z.string().min(1).optional(),
    CLOUDINARY_API_SECRET: z.string().min(1).optional(),
    CLOUDINARY_UPLOAD_FOLDER: z.string().min(1).default('atlas-erp'),

    EMAIL_PROVIDER_MODE: z.enum(['mock', 'sendgrid']).default('mock'),
    SENDGRID_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().email().optional(),
    EMAIL_MAX_SEND_ATTEMPTS: z.coerce.number().int().positive().max(10).default(3),
    EMAIL_RETRY_DELAY_MS: z.coerce.number().int().positive().default(60_000),
    EMAIL_WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),

    OUTBOX_WORKER_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    OUTBOX_WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
    OUTBOX_WORKER_BATCH_SIZE: z.coerce.number().int().positive().max(100).default(25),
    WORKER_SHUTDOWN_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(30),
  })
  .superRefine((value, context) => {
    const globalPrefixes = [
      value.API_GLOBAL_PREFIX,
      value.GLOBAL_API_PREFIX,
      value.API_PREFIX,
    ].filter(Boolean);
    const uniqueGlobalPrefixes = new Set(globalPrefixes);
    if (uniqueGlobalPrefixes.size > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['API_GLOBAL_PREFIX'],
        message:
          'API_GLOBAL_PREFIX, GLOBAL_API_PREFIX y API_PREFIX deben coincidir si se definen juntas.',
      });
    }

    if (value.NODE_ENV === 'production' && value.AUTH_DISABLED_FOR_LOCAL_TESTING) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTH_DISABLED_FOR_LOCAL_TESTING'],
        message: 'AUTH_DISABLED_FOR_LOCAL_TESTING no puede estar activo en producción.',
      });
    }

    if (value.NODE_ENV === 'production' && value.CORS_ALLOWED_ORIGINS.includes('*')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CORS_ALLOWED_ORIGINS'],
        message: 'CORS_ALLOWED_ORIGINS no puede usar * en producción.',
      });
    }

    if (value.NODE_ENV === 'production' && !value.DB_SSL) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DB_SSL'],
        message: 'DB_SSL debe estar activo en producción salvo red privada justificada.',
      });
    }
    if (
      value.EMAIL_PROVIDER_MODE === 'sendgrid' &&
      (!value.SENDGRID_API_KEY || !value.EMAIL_FROM)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SENDGRID_API_KEY'],
        message: 'SENDGRID_API_KEY y EMAIL_FROM son requeridos para SendGrid.',
      });
    }

    if (value.NODE_ENV === 'production' && value.JWT_ACCESS_SECRET.includes('change-this')) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_ACCESS_SECRET'],
        message: 'JWT_ACCESS_SECRET debe cambiarse en producción.',
      });
    }
  })
  .transform((value) => {
    const apiPrefix = value.GLOBAL_API_PREFIX ?? value.API_PREFIX ?? value.API_GLOBAL_PREFIX;
    return {
      ...value,
      API_GLOBAL_PREFIX: apiPrefix,
      GLOBAL_API_PREFIX: apiPrefix,
      API_PREFIX: apiPrefix,
      JWT_INTERNAL_SECRET: value.JWT_INTERNAL_SECRET ?? value.JWT_ACCESS_SECRET,
    };
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
  throw new Error(`Invalid environment variables: ${details.join('; ')}`);
}

export const env = parsed.data;
export type Env = typeof env;
