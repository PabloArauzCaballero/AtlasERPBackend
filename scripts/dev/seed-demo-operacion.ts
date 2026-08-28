import pino from 'pino';
import { resolveSmokeBaseUrl } from '../smoke/smoke-base-url';

/**
 * Siembra de OPERACIÓN para demo y desarrollo local.
 *
 * ## Qué problema resuelve
 *
 * Los seeders del arranque (`DatabaseSeederService`) llenan maestros y catálogos: plan de cuentas,
 * grupos, códigos de impuesto, periodos, anunciantes, planes, productos facturables. Nada más. Todo
 * lo transaccional —eventos publicitarios, métricas, facturas, asientos, recibos, propuestas,
 * aprobaciones— nacía en cero y se quedaba en cero, y como la reportería del ERP se calcula sobre
 * esas tablas, cada tablero, tarjeta y tabla del panel de operaciones salía vacío o en 0. No era
 * una avería: era que la operación nunca había ocurrido.
 *
 * ## Por qué va por la API y no por SQL
 *
 * Sembrar esto con INSERTs sería más corto y sería mentira. La contabilidad tiene disparadores que
 * exigen periodo abierto, asiento cuadrado y dimensiones obligatorias por cuenta; el documento
 * publicado guarda un hash de sus líneas y se vuelve inmutable; la publicidad cobra según la puja
 * y el plan contratado. Una fila puesta a mano puede contradecir todo eso y seguir pareciendo
 * correcta en pantalla. Recorriendo los mismos endpoints que usa el producto, lo que queda en la
 * base es lo que el ERP habría escrito por su cuenta — y si un flujo está roto, esta siembra falla
 * en vez de disimularlo.
 *
 * ## Idempotencia
 *
 * Cada etapa mira primero qué existe y sólo crea lo que falta, reconociéndolo por el prefijo
 * `MARCA`. Correrlo dos veces no duplica nada; correrlo contra una base recién creada la deja
 * lista.
 *
 *   yarn db:seed:demo                 # todas las etapas
 *   yarn db:seed:demo -- ads          # sólo publicidad
 *
 * NUNCA en producción: el guardia de abajo lo impide salvo que se fuerce a conciencia.
 */

const MARCA = 'DEMO';
const baseUrl = resolveSmokeBaseUrl();
const token = process.env.ATLAS_SEED_TOKEN?.trim();
const logger = pino({
  name: 'atlas-seed-demo',
  level: process.env.LOG_LEVEL ?? 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: ['token', '*.token', 'headers.authorization'],
});

/**
 * Lo que devuelve la API, tal cual llega.
 *
 * Se admite `any` en ESTE único punto y con nombre propio. La alternativa —redeclarar aquí los DTO
 * de los cinco módulos que este guion recorre— duplicaría contratos que ya viven en `src/`, y la
 * copia se quedaría atrás en la primera migración sin que nada avisara. Un guion de siembra que
 * miente sobre la forma de la respuesta es peor que uno que admite no conocerla.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RespuestaApi = Record<string, any>;

class ErrorDeApi extends Error {
  constructor(
    readonly metodo: string,
    readonly ruta: string,
    readonly estado: number,
    readonly cuerpo: string,
  ) {
    super(`${metodo} ${ruta} → ${estado}: ${cuerpo.slice(0, 500)}`);
    this.name = 'ErrorDeApi';
  }
}

async function pedir<T = RespuestaApi>(
  metodo: string,
  ruta: string,
  cuerpo?: unknown,
  opciones: { tolerarConflicto?: boolean } = {},
): Promise<T | null> {
  const respuesta = await fetch(`${baseUrl}${ruta}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
  });
  const texto = await respuesta.text();
  if (!respuesta.ok) {
    // Un 409 es la respuesta correcta cuando el recurso ya estaba: la etapa siguiente lo encontrará
    // buscando. Sólo se tolera donde se pide explícitamente, para que un conflicto inesperado siga
    // rompiendo la siembra en vez de dejar un hueco silencioso.
    if (opciones.tolerarConflicto && respuesta.status === 409) {
      logger.debug({ metodo, ruta }, 'Recurso ya existente; se continúa');
      return null;
    }
    throw new ErrorDeApi(metodo, ruta, respuesta.status, texto);
  }
  if (!texto) return null;
  const json = JSON.parse(texto);
  return (json?.data ?? json) as T;
}

const get = <T = RespuestaApi>(ruta: string) => pedir<T>('GET', ruta);
const post = <T = RespuestaApi>(ruta: string, cuerpo: unknown, opciones = {}) =>
  pedir<T>('POST', ruta, cuerpo, opciones);
const patch = <T = RespuestaApi>(ruta: string, cuerpo: unknown, opciones = {}) =>
  pedir<T>('PATCH', ruta, cuerpo, opciones);

function filas(respuesta: RespuestaApi | RespuestaApi[] | null): RespuestaApi[] {
  if (!respuesta) return [];
  if (Array.isArray(respuesta)) return respuesta;
  if (Array.isArray(respuesta.items)) return respuesta.items;
  if (Array.isArray(respuesta.rows)) return respuesta.rows;
  return [];
}

const dias = (n: number): Date => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const iso = (fecha: Date): string => fecha.toISOString();
const soloFecha = (fecha: Date): string => fecha.toISOString().slice(0, 10);
/** Hash opaco de relleno. 64 hex: cumple el mínimo de 16 y no se parece a un dato personal. */
const hash = (semilla: string): string =>
  Array.from(semilla)
    .reduce((acumulado, caracter) => acumulado * 31 + caracter.charCodeAt(0), 7)
    .toString(16)
    .padStart(16, '0')
    .repeat(4)
    .slice(0, 64);

/**
 * Exige que la API haya devuelto algo. Un guion de siembra que sigue adelante con un `undefined`
 * termina escribiendo filas huérfanas y culpando al siguiente de haberlas dejado ahí.
 */
function exigir<T>(valor: T, mensaje: string): NonNullable<T> {
  if (valor === null || valor === undefined) throw new Error(mensaje);
  return valor as NonNullable<T>;
}

function assertEntornoLocal(): void {
  const forzado = process.env.ATLAS_SEED_DEMO_FORCE === 'true';
  const esLocal = /^https?:\/\/(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(baseUrl);
  if (!esLocal && !forzado) {
    throw new Error(
      `Esta siembra crea operación de demostración y sólo debe correr en local. ` +
        `API_BASE_URL apunta a ${baseUrl}. Si de verdad es lo que quieres, exporta ` +
        `ATLAS_SEED_DEMO_FORCE=true.`,
    );
  }
}

// =====================================================================================
// Publicidad
// =====================================================================================

/**
 * Recorre la cadena publicitaria entera: perfil de facturación → segmentos → creatividad →
 * conjunto → anuncio → moderación → activación → entregas → eventos → cierre de periodo → factura
 * → cobro.
 *
 * Es el único camino por el que el tablero de Ads puede dejar de estar en cero: sus seis
 * indicadores (ingresos, gasto facturable, campañas activas, revisiones pendientes, facturas
 * vencidas y tasa de evento inválido) se calculan sobre `ad_invoices`, `ad_spend_ledger`,
 * `ad_campaigns`, `ad_moderation_reviews` y `ad_events`, y ninguna de esas tablas se llena si la
 * cadena se interrumpe antes.
 */
async function sembrarPublicidad(): Promise<void> {
  const anunciantes = filas(await get('/admin/ads/advertisers?page=1&pageSize=50'));
  if (anunciantes.length === 0) throw new Error('No hay anunciantes; corre antes `yarn db:seed`.');

  // --- Perfiles de facturación: sin uno, el cierre de periodo no puede emitir factura ---------
  for (const anunciante of anunciantes) {
    const detalle = await get(`/admin/ads/advertisers/${anunciante.id}`);
    if (filas(detalle?.billingProfiles ?? detalle?.billing_profiles).length > 0) continue;
    await post(
      `/admin/ads/advertisers/${anunciante.id}/billing-profiles`,
      {
        fiscalName: anunciante.legalName ?? anunciante.tradeName,
        taxId: String(anunciante.taxId ?? `NIT-${anunciante.id.slice(0, 8)}`),
        billingEmail: `facturacion.${String(anunciante.tradeName ?? 'anunciante')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '')}@atlas.test`,
        city: anunciante.city ?? 'Santa Cruz de la Sierra',
        taxRegime: 'REGIMEN GENERAL',
        isDefault: true,
      },
      { tolerarConflicto: true },
    );
    logger.info({ anunciante: anunciante.tradeName }, 'Perfil de facturación creado');
  }

  // --- Segmentos: la consola de segmentación salía vacía porque nadie había dado de alta uno ---
  const segmentosExistentes = filas(await get('/admin/ads/segments?page=1&pageSize=50'));
  const segmentosDeseados = [
    {
      name: `${MARCA} · Comercios de retail en Santa Cruz`,
      segmentType: 'MERCHANT_CATEGORY' as const,
      privacyLevel: 'CORPORATE_CONTEXTUAL' as const,
      definition: {
        match: 'ALL' as const,
        rules: [{ attribute: 'merchantCategory', operator: 'EQUALS', value: 'RETAIL' }],
      },
    },
    {
      name: `${MARCA} · Cobertura eje troncal`,
      segmentType: 'GEO' as const,
      // Ningún atributo de esta definición es un hash, así que `requiredPrivacyLevel` exige
      // CORPORATE_CONTEXTUAL: declarar AGGREGATED sería reclamar una anonimización que el segmento
      // no aplica.
      privacyLevel: 'CORPORATE_CONTEXTUAL' as const,
      definition: {
        match: 'ANY' as const,
        rules: [
          {
            attribute: 'city',
            operator: 'IN',
            value: ['Santa Cruz de la Sierra', 'La Paz', 'Cochabamba'],
          },
        ],
      },
    },
  ];
  for (const deseado of segmentosDeseados) {
    if (segmentosExistentes.some((segmento) => segmento.name === deseado.name)) continue;
    await post('/admin/ads/segments', deseado, { tolerarConflicto: true });
    logger.info({ segmento: deseado.name }, 'Segmento creado');
  }
  const segmentos = filas(await get('/admin/ads/segments?page=1&pageSize=50'));

  // --- Piezas de cada campaña -----------------------------------------------------------------
  const placements = filas(await get('/admin/ads/inventory'));
  if (placements.length === 0) throw new Error('No hay espacios publicitarios en el inventario.');
  const campanas = filas(await get('/admin/ads/campaigns?page=1&pageSize=50'));
  // Tres campañas bastan para que el tablero cuente una historia completa: dos entregando y
  // facturando, una detenida en la cola de moderación para que «revisiones pendientes» no sea 0.
  const elegidas = campanas
    .filter((campana) => !['ENDED', 'ARCHIVED'].includes(campana.status))
    .slice(0, 3);
  if (elegidas.length === 0) throw new Error('No hay campañas utilizables.');

  // Sólo se guarda la campaña: el módulo publica `GET /admin/ads/ad-sets` y `GET
  // /admin/ads/creatives`, pero NO expone forma de listar los anuncios de un conjunto, así que no
  // hay manera de enumerarlos desde fuera. No hace falta para lo que sigue —`submit` los resuelve
  // en el servidor— pero conviene saberlo antes de escribir una pantalla que los quiera mostrar.
  const preparadas: Array<{ campana: RespuestaApi }> = [];
  for (const [indice, campana] of elegidas.entries()) {
    const adSetsDeLaCampana = filas(
      await get(`/admin/ads/ad-sets?campaignId=${campana.id}&page=1&pageSize=50`),
    );
    let adSet = adSetsDeLaCampana.find((conjunto: RespuestaApi) =>
      String(conjunto.name ?? '').startsWith(MARCA),
    );

    if (!adSet) {
      const creatividad = exigir(
        await post('/admin/ads/creatives', {
          advertiserId: campana.advertiserId,
          name: `${MARCA} · Creatividad ${campana.name}`.slice(0, 140),
          creativeType: 'TEXT_CARD',
          headline: 'Financia tu compra con Atlas',
          bodyText:
            'Paga en cuotas desde el mismo comercio, sin trámites y con aprobación en minutos.',
          ctaText: 'Ver planes',
          destinationUrl: 'https://atlas.bo/comercios',
        }),
        'La API no devolvió la creatividad recién creada.',
      );
      adSet = exigir(
        await post(`/admin/ads/campaigns/${campana.id}/ad-sets`, {
          name: `${MARCA} · Conjunto ${indice + 1}`,
          buyingModel: indice % 2 === 0 ? 'CPM' : 'CPC',
          bidAmountMicros: indice % 2 === 0 ? 4_000_000 : 2_500_000,
          dailyBudgetMicros: 1_000_000_000,
          targetSegmentId: segmentos[indice % segmentos.length]?.id ?? null,
          placementIds: placements.map((espacio: RespuestaApi) => espacio.id),
          startsAt: iso(dias(30)),
        }),
        'La API no devolvió el conjunto de anuncios recién creado.',
      );
      await post(`/admin/ads/ad-sets/${adSet.id}/ads`, {
        creativeId: creatividad.id,
        name: `${MARCA} · Anuncio ${indice + 1}`,
        weight: 10 - indice,
      });
      logger.info({ campana: campana.name }, 'Conjunto, creatividad y anuncio creados');
    }

    exigir(adSet, 'No se pudo resolver el conjunto de anuncios de la campaña.');
    preparadas.push({ campana });
  }

  // --- Moderación: enviar y decidir -----------------------------------------------------------
  for (const { campana } of preparadas) {
    if (campana.approvalStatus === 'NOT_SUBMITTED') {
      await post(
        `/admin/ads/campaigns/${campana.id}/submit`,
        { notes: 'Envío a revisión de la operación de demostración.' },
        { tolerarConflicto: true },
      );
      logger.info({ campana: campana.name }, 'Campaña enviada a moderación');
    }
  }

  // La última campaña preparada se deja sin decidir a propósito: es lo que da contenido a la cola
  // de moderación y hace que el indicador «revisiones pendientes» del tablero no sea cero.
  const idsAAprobar = new Set(preparadas.slice(0, -1).map(({ campana }) => campana.id));
  const cola = filas(await get('/admin/ads/moderation/queue?page=1&pageSize=200'));
  for (const revision of cola) {
    if (!idsAAprobar.has(revision.campaignId)) continue;
    await post(
      `/admin/ads/moderation/${revision.id}/decision`,
      {
        reviewStatus: 'APPROVED',
        reasonCode: 'POLICY_OK',
        notes: 'Pieza conforme a la política publicitaria.',
        requiresAdvertiserChanges: false,
      },
      { tolerarConflicto: true },
    );
  }
  logger.info({ decididas: idsAAprobar.size }, 'Revisiones de moderación resueltas');

  // --- Activación -----------------------------------------------------------------------------
  const activas: RespuestaApi[] = [];
  for (const id of idsAAprobar) {
    const campana = exigir(
      await get(`/admin/ads/campaigns/${id}`),
      `La campaña ${id} desapareció entre la aprobación y la activación.`,
    );
    if (campana.status !== 'ACTIVE') {
      await patch(
        `/admin/ads/campaigns/${id}/status`,
        { status: 'ACTIVE', reason: 'Alta en entrega de la operación de demostración.' },
        { tolerarConflicto: true },
      );
    }
    activas.push(exigir(await get(`/admin/ads/campaigns/${id}`), 'Campaña no encontrada.'));
  }
  logger.info({ activas: activas.length }, 'Campañas activadas');

  // --- Entregas y eventos ---------------------------------------------------------------------
  // Se mira impresiones y no peticiones de entrega: una decisión sin evento detrás es justo el
  // estado a medias que hay que completar, no una señal de que ya está sembrado.
  const yaHayEventos = (await get('/admin/ads/delivery-monitor'))?.kpis?.impressions ?? 0;
  if (yaHayEventos > 0) {
    logger.info({ yaHayEventos }, 'Ya hay entregas registradas; no se duplican eventos');
  } else {
    const eventos: RespuestaApi[] = [];
    let entregas = 0;
    for (let jornada = 20; jornada >= 1; jornada -= 1) {
      for (const espacio of placements) {
        for (let vuelta = 0; vuelta < 3; vuelta += 1) {
          const semilla = `${jornada}-${espacio.code}-${vuelta}`;
          const decision = await post('/ads/delivery/select', {
            placementCode: espacio.code,
            corporateClientHash: hash(`cliente-${vuelta}`),
            contextHash: hash(`contexto-${semilla}`),
            audience: {
              merchantCategory: 'RETAIL',
              city: 'Santa Cruz de la Sierra',
            },
          });
          const decisionId = decision?.deliveryDecisionId;
          if (!decisionId) continue;
          entregas += 1;

          const momento = iso(dias(jornada));
          eventos.push({
            eventType: 'IMPRESSION',
            deliveryDecisionId: decisionId,
            eventTime: momento,
            corporateClientHash: hash(`cliente-${vuelta}`),
            sessionHash: hash(`sesion-${semilla}`),
            // Un 8 % de tráfico sucio: sin eventos marcados, «tasa de evento inválido» sería 0 % y
            // el monitor de fraude no tendría nada que enseñar ni contra qué contrastarse.
            fraudScore: jornada % 12 === 0 ? 0.92 : 0.05,
            metadata: { origen: MARCA },
          });
          if (vuelta === 0) {
            eventos.push({
              eventType: 'CLICK',
              deliveryDecisionId: decisionId,
              eventTime: momento,
              corporateClientHash: hash(`cliente-${vuelta}`),
              sessionHash: hash(`sesion-${semilla}`),
              fraudScore: 0.04,
              metadata: { origen: MARCA },
            });
          }
          if (jornada % 5 === 0 && vuelta === 0) {
            eventos.push({
              eventType: 'CONVERSION',
              deliveryDecisionId: decisionId,
              eventTime: momento,
              corporateClientHash: hash(`cliente-${vuelta}`),
              sessionHash: hash(`sesion-${semilla}`),
              metadata: { origen: MARCA, tipo: 'ALTA_COMERCIO' },
            });
          }
        }
      }
    }
    // En lotes: `bulkTrackEventsSchema` admite 500 por petición.
    for (let desde = 0; desde < eventos.length; desde += 400) {
      await post('/ads/events/bulk', {
        batchExternalId: `${MARCA}-${desde}`,
        items: eventos.slice(desde, desde + 400),
      });
    }
    logger.info({ entregas, eventos: eventos.length }, 'Entregas y eventos registrados');
  }

  // --- Cierre de periodo y cobro --------------------------------------------------------------
  const hoy = new Date();
  const inicioDeMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const cierre = await post(
    '/admin/ads/billing/period-close',
    { periodStart: soloFecha(dias(35)), periodEnd: soloFecha(hoy) },
    { tolerarConflicto: true },
  );
  const facturasDelCierre = filas(cierre?.invoices);
  logger.info(
    { inicioDeMes: soloFecha(inicioDeMes), facturas: facturasDelCierre.length },
    'Cierre de periodo Ads',
  );

  // --- Cobro de la primera factura -------------------------------------------------------------
  // «Ingresos» del tablero suma facturas ISSUED, PARTIALLY_PAID o PAID. El cierre las deja en
  // DRAFT y el módulo NO expone forma de emitirlas: el único camino que las saca de borrador es
  // registrar un pago, que es el que se usa aquí. Queda anotado como hueco del producto, no como
  // decisión de esta siembra.
  const primera = facturasDelCierre[0];
  if (primera?.invoiceId && Number(primera.totalMicros ?? 0) > 0) {
    const total = Number(primera.totalMicros);
    await post(
      `/admin/ads/invoices/${primera.invoiceId}/payments`,
      {
        // Pago parcial: deja la factura en PARTIALLY_PAID, que es el estado con el que se puede ver
        // que la pantalla distingue cobrado de pendiente.
        amountMicros: Math.floor(total * 0.6),
        currency: primera.currency ?? 'BOB',
        paymentDate: soloFecha(dias(2)),
        paymentMethod: 'TRANSFERENCIA',
        reference: `${MARCA}-PAGO-001`,
      },
      { tolerarConflicto: true },
    );
    logger.info({ factura: primera.invoiceId, total }, 'Pago parcial registrado sobre factura Ads');
  }
}

// =====================================================================================
// Contabilidad
// =====================================================================================

/**
 * Emite y contabiliza operación financiera real: rol de cliente, factura AR con su asiento, cobro
 * con su imputación y un documento manual publicado.
 *
 * Todo pasa por los endpoints que aplican las reglas duras del módulo —periodo abierto, asiento
 * cuadrado, cuenta de control con referencia de submayor, documento publicado inmutable con hash de
 * sus líneas—, así que lo que quede en `accounting_document`, `journal_entry`, `ar_invoice` y
 * `receipt` es contabilidad que cuadra, no filas con pinta de contabilidad.
 */
async function sembrarContabilidad(): Promise<void> {
  const entidades = filas(
    await get('/accounting/financial-structure/legal-entities?page=1&pageSize=20'),
  );
  const ledgers = filas(await get('/accounting/financial-structure/ledgers?page=1&pageSize=20'));
  const ledger = ledgers[0];
  if (!ledger) throw new Error('No hay ledger; corre antes `yarn db:seed`.');
  // La entidad legal que manda es la del ledger: los periodos, el plan de cuentas y el año fiscal
  // cuelgan de ella, y el disparador `fn_assert_accounting_document_context` rechaza cualquier
  // documento cuyo periodo o ledger pertenezcan a otra.
  const entidad = exigir(
    entidades.find((fila: RespuestaApi) => fila.id === ledger.legalEntityId) ?? entidades[0],
    'No hay entidad legal; corre antes `yarn db:seed`.',
  );

  const hoy = new Date();
  const periodos = filas(await get('/accounting/financial-structure/periods?page=1&pageSize=50'));
  const periodo = periodos.find(
    (fila: RespuestaApi) =>
      fila.startDate <= soloFecha(hoy) &&
      fila.endDate >= soloFecha(hoy) &&
      fila.closeStatus === 'OPEN',
  );
  if (!periodo) {
    throw new Error(
      `No hay periodo contable abierto que contenga ${soloFecha(hoy)}. Ábrelo antes de sembrar.`,
    );
  }

  const cuentas = filas(
    await get('/accounting/financial-structure/gl-accounts?page=1&pageSize=100'),
  );
  const cuenta = (numero: string) => {
    const encontrada = cuentas.find((fila: RespuestaApi) => fila.accountNo === numero);
    if (!encontrada) throw new Error(`Falta la cuenta ${numero} en el plan de cuentas.`);
    return encontrada.id as string;
  };
  const impuestos = filas(
    await get('/accounting/financial-structure/tax-codes?page=1&pageSize=50'),
  );
  const ivaVenta = impuestos.find((fila: RespuestaApi) => fila.code === 'IVA13_VENTA');

  // --- Sucursales: la tabla salía vacía porque nadie había dado de alta ninguna ----------------
  const sucursales = filas(
    await get('/accounting/financial-structure/branches?page=1&pageSize=50'),
  );
  for (const deseada of [
    { code: 'SCZ-01', name: 'Casa matriz Santa Cruz', city: 'Santa Cruz de la Sierra' },
    { code: 'LPZ-01', name: 'Agencia La Paz', city: 'La Paz' },
  ]) {
    if (sucursales.some((fila: RespuestaApi) => fila.code === deseada.code)) continue;
    await post(
      '/accounting/financial-structure/branches',
      { legalEntityId: entidad.id, ...deseada },
      { tolerarConflicto: true },
    );
  }

  // --- Rol de cliente: sin él la emisión de factura AR se rechaza ------------------------------
  // `assertInvoiceInputsAreSapSafe` exige que el socio tenga un rol activo CUSTOMER, MERCHANT o
  // INTERCOMPANY EN ESA entidad legal. El único rol que había en la base colgaba de la otra
  // entidad, así que ninguna factura podía emitirse contra la que tiene el ledger.
  const socios = filas(await get('/accounting/business-partners?page=1&pageSize=50'));
  const cliente = socios.find((fila: RespuestaApi) => fila.partnerType === 'COMPANY') ?? socios[0];
  if (!cliente) throw new Error('No hay business partners; corre antes `yarn db:seed`.');
  await post(
    '/accounting/business-partners/roles',
    {
      businessPartnerId: cliente.id,
      roleCode: 'CUSTOMER',
      legalEntityId: entidad.id,
      effectiveFrom: soloFecha(dias(365)),
    },
    { tolerarConflicto: true },
  );

  // --- Facturas AR con su asiento --------------------------------------------------------------
  const emitidas = filas(await get('/accounting/billing/ar-invoices?page=1&pageSize=100'));
  const facturas: RespuestaApi[] = [];
  const aEmitir = [
    { sufijo: '0001', neto: 12500, descripcion: 'Suscripción plataforma Atlas — mes corriente' },
    { sufijo: '0002', neto: 7800, descripcion: 'Implementación y puesta en marcha' },
  ];
  for (const plan of aEmitir) {
    const numero = `${MARCA}-AR-${plan.sufijo}`;
    const yaEmitida = emitidas.find((fila: RespuestaApi) => fila.invoiceNo === numero);
    if (yaEmitida) {
      facturas.push(yaEmitida);
      continue;
    }
    const impuesto = Math.round(plan.neto * 0.13 * 100) / 100;
    const emitida = await post('/accounting/billing/ar-invoices', {
      legalEntityId: entidad.id,
      customerBpId: cliente.id,
      invoiceNo: numero,
      invoiceDate: soloFecha(hoy),
      dueDate: soloFecha(new Date(hoy.getTime() + 30 * 24 * 60 * 60 * 1000)),
      currencyCode: 'BOB',
      netAmount: plan.neto,
      taxAmount: impuesto,
      arAccountId: cuenta('120101'),
      revenueAccountId: cuenta('410201'),
      taxLiabilityAccountId: cuenta('220101'),
      taxCodeId: ivaVenta?.id,
      description: plan.descripcion,
      accountingPeriodId: periodo.id,
      ledgerId: ledger.id,
    });
    facturas.push(emitida?.invoice ?? emitida);
    logger.info({ factura: numero }, 'Factura AR emitida y contabilizada');
  }

  // --- Cobro parcial: deja una factura cobrada y otra abierta ----------------------------------
  const recibos = filas(await get('/accounting/receipts?page=1&pageSize=100'));
  const numeroRecibo = `${MARCA}-REC-0001`;
  const primeraFactura = facturas[0];
  if (primeraFactura && !recibos.some((fila: RespuestaApi) => fila.receiptNo === numeroRecibo)) {
    const bruto = Number(primeraFactura.grossAmount ?? primeraFactura.gross_amount ?? 0);
    if (bruto > 0) {
      await post(
        '/accounting/receipts',
        {
          legalEntityId: entidad.id,
          payerBpId: cliente.id,
          receiptNo: numeroRecibo,
          receiptDate: soloFecha(hoy),
          amount: bruto,
          currencyCode: 'BOB',
          bankGlAccountId: cuenta('110201'),
          arControlGlAccountId: cuenta('120101'),
          accountingPeriodId: periodo.id,
          ledgerId: ledger.id,
          allocations: [{ arInvoiceId: primeraFactura.id, allocatedAmount: bruto }],
        },
        { tolerarConflicto: true },
      );
      logger.info({ recibo: numeroRecibo, importe: bruto }, 'Recibo registrado e imputado');
    }
  }

  // --- Documento manual publicado --------------------------------------------------------------
  // Un gasto corriente pagado por banco: dos cuentas sin dimensiones obligatorias, que es lo que
  // permite publicarlo sin arrastrar centros de coste que este ERP todavía no sabe dar de alta.
  const documentos = filas(await get('/accounting/documents?page=1&pageSize=100'));
  const numeroDocumento = `${MARCA}-JR-0001`;
  const documentoExistente = documentos.find(
    (fila: RespuestaApi) => fila.documentNo === numeroDocumento,
  );
  // Un borrador que quedó a medias se termina de publicar: dejarlo en DRAFT es dejar un asiento
  // que no llega al mayor y no cuenta para ningún informe.
  if (documentoExistente?.status === 'DRAFT') {
    await patch(
      `/accounting/documents/${documentoExistente.id}/post`,
      {},
      { tolerarConflicto: true },
    );
    logger.info({ documento: numeroDocumento }, 'Borrador pendiente publicado');
  }
  if (!documentoExistente) {
    const borrador = await post('/accounting/documents', {
      legalEntityId: entidad.id,
      sourceSystem: 'ACCOUNTING',
      sourceType: 'MANUAL',
      sourceId: numeroDocumento,
      documentType: 'JOURNAL',
      documentNo: numeroDocumento,
      documentDate: soloFecha(hoy),
      postingDate: soloFecha(hoy),
      accountingPeriodId: periodo.id,
      ledgerId: ledger.id,
      currencyCode: 'BOB',
      lines: [
        {
          glAccountId: cuenta('510101'),
          debit: 4200,
          credit: 0,
          currencyCode: 'BOB',
          amountLc: 4200,
          description: 'Infraestructura cloud del mes',
        },
        {
          glAccountId: cuenta('110201'),
          debit: 0,
          credit: 4200,
          currencyCode: 'BOB',
          amountLc: 4200,
          description: 'Pago desde banco operativo',
        },
      ],
    });
    const documentoId = borrador?.document?.id ?? borrador?.id;
    if (documentoId) {
      // PATCH, no POST: publicar es una transición de estado del documento, no un recurso nuevo.
      await patch(`/accounting/documents/${documentoId}/post`, {}, { tolerarConflicto: true });
      logger.info({ documento: numeroDocumento }, 'Documento contable publicado');
    }
  }
}

// =====================================================================================
// CRM B2B
// =====================================================================================

/**
 * Contactos, actividades y el encadenado propuesta → aprobación → contrato.
 *
 * Las pantallas de propuestas y de aprobaciones salían vacías porque sus tablas estaban en cero:
 * el CRM sabía crear cuentas y oportunidades, pero nadie había recorrido el resto del embudo. Se
 * dejan las tres decisiones posibles —pendiente, aprobada y rechazada— porque una cola donde todo
 * está decidido igual no permite ver si la pantalla distingue los estados.
 */
async function sembrarCrm(): Promise<void> {
  const cuentas = filas(await get('/b2b/accounts?page=1&limit=50'));
  if (cuentas.length === 0) throw new Error('No hay cuentas B2B; corre antes `yarn db:seed`.');
  const usuarios = filas(await get('/b2b/internal-users?page=1&limit=50'));
  const ejecutivo =
    usuarios.find((fila: RespuestaApi) => fila.roleCode === 'COMMERCIAL_EXECUTIVE') ?? usuarios[0];
  if (!ejecutivo) throw new Error('No hay usuarios internos.');

  // --- Contactos y actividades -----------------------------------------------------------------
  for (const [indice, cuenta] of cuentas.entries()) {
    // Los contactos se leen del detalle de la cuenta: el módulo tiene `POST
    // /b2b/accounts/:id/contacts` pero NO un GET propio, así que el detalle es el único sitio desde
    // el que se puede saber si ya existen antes de crear otro.
    const detalleCuenta = await get(`/b2b/accounts/${cuenta.id}`);
    const contactos = filas(detalleCuenta?.contacts);
    if (contactos.length === 0) {
      await post(
        `/b2b/accounts/${cuenta.id}/contacts`,
        {
          fullName: `Contacto comercial ${cuenta.tradeName ?? cuenta.legalName}`.slice(0, 180),
          roleTitle: 'Gerencia general',
          email: `contacto${indice + 1}@atlas.test`,
          phone: `+591 700000${indice + 1}`,
          decisionRole: 'DECISOR',
          isPrimary: true,
        },
        { tolerarConflicto: true },
      );
    }
    const actividades = filas(await get(`/b2b/activities?accountId=${cuenta.id}`));
    if (actividades.length === 0) {
      await post(
        '/b2b/activities',
        {
          accountId: cuenta.id,
          ownerUserId: ejecutivo.id,
          activityType: 'CALL',
          subject: `Seguimiento comercial — ${cuenta.tradeName ?? cuenta.legalName}`.slice(0, 220),
          description: 'Repaso de consumo del mes y condiciones vigentes.',
          dueAt: iso(dias(-3)),
        },
        { tolerarConflicto: true },
      );
    }
  }
  logger.info({ cuentas: cuentas.length }, 'Contactos y actividades sembrados');

  // --- Propuestas ------------------------------------------------------------------------------
  const oportunidades = filas(await get('/b2b/opportunities?page=1&limit=50'));
  const existentes = filas(await get('/b2b/proposals?page=1&limit=100'));
  const planes = [
    { sufijo: '01', destino: 'ACEPTADA' as const },
    { sufijo: '02', destino: 'ENVIADA' as const },
    { sufijo: '03', destino: 'BORRADOR' as const },
  ];
  const propuestas: Array<{ propuesta: RespuestaApi; destino: string }> = [];

  for (const [indice, plan] of planes.entries()) {
    const oportunidad = oportunidades[indice % oportunidades.length];
    if (!oportunidad) break;
    const numero = `${MARCA}-CP-${plan.sufijo}`;
    let propuesta = existentes.find((fila: RespuestaApi) => fila.proposalNumber === numero);
    if (!propuesta) {
      propuesta = exigir(
        await post('/b2b/proposals', {
          opportunityId: oportunidad.id,
          proposalNumber: numero,
          validUntil: soloFecha(new Date(Date.now() + 45 * 24 * 60 * 60 * 1000)),
          totalEstimatedMonthlyRevenue: 4800 + indice * 1200,
          lines: [
            {
              termType: 'MDR',
              description: 'Comisión por transacción financiada',
              ratePercent: 3.5,
              currency: 'BOB',
              billingTiming: 'PER_TRANSACTION',
            },
            {
              termType: 'SUBSCRIPTION',
              description: 'Suscripción mensual a la plataforma',
              fixedAmount: 350,
              currency: 'BOB',
              billingTiming: 'MONTHLY',
              minimumMonthlyAmount: 350,
            },
          ],
        }),
        'La API no devolvió la propuesta recién creada.',
      );
      logger.info({ propuesta: numero }, 'Propuesta comercial creada');
    }
    propuestas.push({ propuesta, destino: plan.destino });
  }

  // --- Aprobaciones y avance del embudo --------------------------------------------------------
  for (const { propuesta, destino } of propuestas) {
    if (destino === 'BORRADOR') continue;
    // PATCH y sin cuerpo: enviar y aceptar son transiciones de estado de la propuesta, y el
    // aprobador lo resuelve el servidor a partir de la sesión.
    if (propuesta.status === 'DRAFT') {
      await patch(`/b2b/proposals/${propuesta.id}/send`, undefined, { tolerarConflicto: true });
    }
    if (destino !== 'ACEPTADA') continue;
    await patch(`/b2b/proposals/${propuesta.id}/accept`, undefined, { tolerarConflicto: true });
  }

  const aprobaciones = filas(await get('/b2b/proposals/approvals?page=1&limit=100'));
  // Se decide todo menos la última: la cola necesita a la vez aprobadas, rechazadas y al menos una
  // pendiente para que se pueda ver si la pantalla distingue los tres estados. Las aprobaciones no
  // se crean a mano — las levanta el propio módulo cuando una propuesta se sale de política—, así
  // que se decide sobre las que haya y siempre se reserva una sin decidir.
  for (const [indice, aprobacion] of aprobaciones.entries()) {
    if (aprobacion.status !== 'PENDING' || indice === aprobaciones.length - 1) continue;
    await patch(
      `/b2b/proposals/approvals/${aprobacion.id}/decision`,
      {
        status: indice % 2 === 0 ? 'APPROVED' : 'REJECTED',
        reason:
          indice % 2 === 0
            ? 'Condiciones dentro de política comercial.'
            : 'Descuento por encima del margen autorizado.',
      },
      { tolerarConflicto: true },
    );
  }
  logger.info({ aprobaciones: aprobaciones.length }, 'Cola de aprobaciones resuelta parcialmente');
}

// =====================================================================================
// Orquestación
// =====================================================================================

const etapas: Record<string, () => Promise<void>> = {
  ads: sembrarPublicidad,
  contabilidad: sembrarContabilidad,
  crm: sembrarCrm,
};

async function main(): Promise<void> {
  assertEntornoLocal();
  const pedidas = process.argv.slice(2).filter((argumento) => !argumento.startsWith('-'));
  const aCorrer = pedidas.length > 0 ? pedidas : Object.keys(etapas);
  const desconocidas = aCorrer.filter((nombre) => !etapas[nombre]);
  if (desconocidas.length > 0) {
    throw new Error(
      `Etapas desconocidas: ${desconocidas.join(', ')}. Disponibles: ${Object.keys(etapas).join(', ')}.`,
    );
  }

  logger.info({ baseUrl, etapas: aCorrer }, 'Siembra de operación iniciada');
  for (const nombre of aCorrer) {
    const etapa = etapas[nombre];
    if (!etapa) continue;
    logger.info({ etapa: nombre }, 'Etapa iniciada');
    await etapa();
    logger.info({ etapa: nombre }, 'Etapa completada');
  }
  logger.info('Siembra de operación completada');
}

main().catch((error: unknown) => {
  if (error instanceof ErrorDeApi) {
    logger.error(
      { metodo: error.metodo, ruta: error.ruta, estado: error.estado, cuerpo: error.cuerpo },
      'La siembra se detuvo por una respuesta de la API',
    );
  } else {
    logger.error({ error: error instanceof Error ? error.message : error }, 'La siembra falló');
  }
  process.exitCode = 1;
});
