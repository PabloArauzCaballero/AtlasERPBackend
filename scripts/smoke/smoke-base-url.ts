import 'dotenv/config';

/**
 * URL base contra la que corren los smokes.
 *
 * Estaba fija en `http://localhost:3000/api/v1` dentro de cada script. El problema no era la
 * repetición: era que ese puerto dejó de ser el del ERP —el despliegue local usa `PORT=3020`, que
 * es lo que también espera el frontend— y en la máquina de desarrollo el 3000 lo ocupa otro
 * producto. El smoke le pegaba a un servicio ajeno y fallaba con un `404 Cannot GET /api/v1/health`
 * que parece un ERP roto y en realidad es un ERP al que nadie preguntó.
 *
 * Derivarla de `PORT` la mantiene alineada con el servicio que este mismo repositorio levanta, sin
 * que nadie tenga que acordarse de exportar nada. `API_BASE_URL` sigue mandando cuando se apunta a
 * un despliegue remoto.
 */
export function resolveSmokeBaseUrl(): string {
  const explicit = process.env.API_BASE_URL?.trim();
  if (explicit) return explicit;
  const port = process.env.PORT?.trim() || '3000';
  return `http://localhost:${port}/api/v1`;
}
