process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5432/atlas_test';
process.env.JWT_ACCESS_SECRET ??= 'test_secret_with_more_than_32_characters';
process.env.CORS_ALLOWED_ORIGINS ??= 'http://localhost:5273';
process.env.LOG_LEVEL ??= 'silent';
process.env.AUTH_DISABLED_FOR_LOCAL_TESTING ??= 'false';
