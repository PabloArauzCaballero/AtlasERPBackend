import { Injectable } from '@nestjs/common';
import type { RequestOrigin } from './request-origin';

/** Lo que se sabe de una ruta desde que arrancó esta instancia. */
export interface AccessRunTally {
  method: string;
  path: string;
  ok: number;
  failed: number;
  lastStatus: number;
  lastAt: string;
  statuses: Record<string, number>;
}

/** Lo que se hizo desde una pantalla de un cliente, desde que arrancó esta instancia. */
export interface ScreenRunTally {
  client: string;
  screen: string;
  calls: number;
  failed: number;
  lastAt: string;
  routes: Array<{ method: string; path: string; calls: number; failed: number }>;
  /** Si se dejaron de anotar rutas de esta pantalla por el tope: la lista de rutas no está completa. */
  routesTruncated: boolean;
}

/**
 * Cuenta las peticiones atendidas por (método, ruta plantilla, estado), en memoria.
 *
 * ## Por qué en memoria y no en una tabla
 *
 * Lo único que hace falta responder es «¿esta ruta se ejecutó de verdad y cómo acabó?», que es lo
 * que Flujos pregunta para verificar. Una fila por petición en PostgreSQL respondería lo mismo a
 * cambio de una escritura por request en el camino caliente y una tabla que crece sin tope: caro
 * para lo que aporta. Un contador acotado no escribe nada y responde igual.
 *
 * ## Lo que esto NO es, y se declara
 *
 * No es un histórico: se pierde al reiniciar el proceso y cada réplica cuenta lo suyo. Por eso la
 * respuesta dice «desde el arranque de esta instancia» y no finge una ventana de treinta días. Si
 * algún día hace falta ese histórico, la decisión es persistirlo, y es del equipo del ERP.
 *
 * ## La ruta que se guarda es la PLANTILLA
 *
 * `/accounting/ar-invoices/:id`, no `/accounting/ar-invoices/8123`. Sin eso, un endpoint con
 * parámetro generaría una entrada por cada id y el registro crecería con el tráfico en vez de con
 * la superficie de la API, que es lo que se quiere medir.
 */
@Injectable()
export class HttpAccessRegistryService {
  /** Tope de seguridad: si se superara, algo está generando rutas en vez de reusar plantillas. */
  private static readonly MAX_ENTRIES = 2000;
  /**
   * Las pantallas llegan con su ruta CONCRETA (`/operaciones/clientes/42`), así que este mapa sí
   * crece con el tráfico. Al tope se deja de anotar pantallas nuevas y se DICE: quien lea la lista
   * tiene que saber que le faltan, o convertiría un corte en «nadie abrió esa pantalla».
   */
  private static readonly MAX_SCREENS = 2000;
  private static readonly MAX_ROUTES_PER_SCREEN = 40;
  private readonly tallies = new Map<string, AccessRunTally>();
  private readonly screens = new Map<string, ScreenRunTally>();
  private screensTruncated = false;
  private readonly startedAt = new Date().toISOString();

  record(
    method: string,
    path: string,
    statusCode: number,
    origin: RequestOrigin | null = null,
  ): void {
    if (origin) this.recordScreen(method, path, statusCode, origin);
    const clave = `${method} ${path}`;
    const previo = this.tallies.get(clave);
    if (!previo && this.tallies.size >= HttpAccessRegistryService.MAX_ENTRIES) return;
    const tally = previo ?? {
      method,
      path,
      ok: 0,
      failed: 0,
      lastStatus: statusCode,
      lastAt: '',
      statuses: {},
    };
    // Se cuenta como fallo sólo el 5xx: un 401 o un 404 es el flujo haciendo lo que debe.
    tally[statusCode >= 500 ? 'failed' : 'ok'] += 1;
    tally.statuses[String(statusCode)] = (tally.statuses[String(statusCode)] ?? 0) + 1;
    tally.lastStatus = statusCode;
    tally.lastAt = new Date().toISOString();
    this.tallies.set(clave, tally);
  }

  snapshot(): {
    since: string;
    scope: string;
    entries: AccessRunTally[];
    screens: ScreenRunTally[];
    screensTruncated: boolean;
  } {
    return {
      since: this.startedAt,
      scope: 'process',
      entries: [...this.tallies.values()].sort((a, b) =>
        `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`),
      ),
      screens: [...this.screens.values()].sort((a, b) =>
        `${a.client} ${a.screen}`.localeCompare(`${b.client} ${b.screen}`),
      ),
      screensTruncated: this.screensTruncated,
    };
  }

  /**
   * Desde qué pantalla se llamó, para que Flujos pueda verificar las pantallas del portal del ERP.
   * Mismo criterio de fallo que las rutas: sólo el 5xx.
   */
  private recordScreen(
    method: string,
    path: string,
    statusCode: number,
    origin: RequestOrigin,
  ): void {
    const clave = `${origin.client} ${origin.screen}`;
    let tally = this.screens.get(clave);
    if (!tally) {
      if (this.screens.size >= HttpAccessRegistryService.MAX_SCREENS) {
        this.screensTruncated = true;
        return;
      }
      tally = {
        client: origin.client,
        screen: origin.screen,
        calls: 0,
        failed: 0,
        lastAt: '',
        routes: [],
        routesTruncated: false,
      };
      this.screens.set(clave, tally);
    }
    const fallo = statusCode >= 500 ? 1 : 0;
    tally.calls += 1;
    tally.failed += fallo;
    tally.lastAt = new Date().toISOString();
    const ruta = tally.routes.find((r) => r.method === method && r.path === path);
    if (ruta) {
      ruta.calls += 1;
      ruta.failed += fallo;
    } else if (tally.routes.length < HttpAccessRegistryService.MAX_ROUTES_PER_SCREEN) {
      tally.routes.push({ method, path, calls: 1, failed: fallo });
    } else {
      tally.routesTruncated = true;
    }
  }
}
