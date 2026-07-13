# Postman

Esta carpeta contiene la colección Postman del backend integrado ATLAS.

## Archivo principal

- `collection.json`: colección actualizada para probar endpoints de CRM/Ventas B2B, contabilidad, publicidad externa, delivery Ads, endpoints BULK/BATCH y Business Action Logs.

## Pruebas locales sin token

Para probar manualmente desde Postman sin generar JWT, configura el `.env` local así y reinicia la API:

```env
AUTH_DISABLED_FOR_LOCAL_TESTING=true
AUTH_DISABLED_USER_ID=local-postman-user
AUTH_DISABLED_USER_EMAIL=postman.local@atlas.test
AUTH_DISABLED_ROLES=ADMIN,AUDITOR,COMMERCIAL_EXECUTIVE,COMMERCIAL_MANAGER,FINANCE,LEGAL,OPERATIONS,COLLECTIONS,MERCHANT_ADMIN,ACCOUNTANT,CFO,TREASURY,ADS_ADMIN_VIEWER,ADS_ADMIN_MANAGER,ADS_ADMIN_OPERATOR,ADS_FINANCE,ADS_AUDITOR,ADS_MODERATOR,ADS_COMPLIANCE_ADMIN,ADS_INVENTORY_MANAGER,ADS_OPS_MONITOR,ADS_AD_SERVER,ADS_EVENT_TRACKER
```

Con esa bandera activa, `JwtAuthGuard` no exige `Authorization: Bearer <token>` y crea un usuario local de pruebas con los roles configurados.

## Seguridad

`AUTH_DISABLED_FOR_LOCAL_TESTING=true` está bloqueado por validación de entorno cuando `NODE_ENV=production`. Si alguien intenta arrancar producción con esa bandera activa, la aplicación falla al iniciar.

## Uso recomendado

1. Importa `collection.json` en Postman.
2. Ajusta la variable `baseUrl`, por defecto `http://localhost:3000/api/v1`.
3. Corre primero `Health` y `Ready`.
4. Para endpoints que dependen de datos previos, reemplaza las variables `{{accountId}}`, `{{legalEntityId}}`, `{{advertiserId}}`, etc. con IDs reales creados por tu base local.
5. Si prefieres probar con JWT real, deja `AUTH_DISABLED_FOR_LOCAL_TESTING=false`, genera tu token y habilita manualmente el header `Authorization` incluido como header desactivado en cada request.
