# Sonda de salud (`GET /api/v1/health`)

Devuelve `200` con `{ "status": "ok", "service": "..." }` mientras el proceso atiende peticiones.
Es una sonda de **liveness**: no consulta la base ni las dependencias, así que un `200` significa
«el proceso responde», no «todo el ERP funciona».

```bash
curl -s http://127.0.0.1:3020/api/v1/health
```

## Quién la consume

Además del orquestador de contenedores, desde agosto de 2026 la consulta el **portal interno de
ATLAS**. El backend de Atlas cataloga este servicio como la herramienta `ERP_BACKEND` en su panel de
sistemas y lo comprueba por HTTP, sin credenciales ni cuerpo, contra la ruta que le indique su
variable `ERP_BACKEND_HEALTH_PATH` (por defecto `/api/v1/health`).

> **Cambiar la ruta o el código de estado rompe un panel ajeno.** Si esta ruta se mueve, se protege
> tras autenticación o pasa a devolver un no-2xx en condiciones normales, el panel de operaciones de
> Atlas marcará el ERP como caído aunque esté sano. La ruta es parametrizable del otro lado para
> absorber un cambio deliberado, pero hay que avisar: nadie mira la variable de otro repositorio
> hasta que algo se pone rojo.

## Qué NO implica ese catálogo

Que Atlas cataloge el ERP **no crea ninguna dependencia entre productos**: son dos backends con
bases separadas y Atlas no consume ninguna API de negocio de este servicio. Por eso la herramienta
está marcada como **no crítica** allí — que el ERP esté caído no degrada Atlas, sólo hace que
operaciones pierda visibilidad. El detalle está en
`AtlasBackend/docs/observability/servicios-hermanos.md`.
