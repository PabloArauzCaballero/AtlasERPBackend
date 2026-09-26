/**
 * Qué hace el ERP con cada código que devuelve el SIN (anexo B del plan de facturación).
 *
 * Regla de oro: un código que no está aquí es `ERROR` reintentable con alerta al operador, nunca un
 * `REJECTED` silencioso. Un rechazo terminal inventado deja una factura sin documento fiscal y sin
 * que nadie lo sepa; un error reintentable se ve en la bandeja y se investiga.
 */

export type AccionSiat =
  /** Estado de la recepción: la máquina de estados decide. */
  | 'ESTADO'
  /** CUIS/CUFD caducado o desconocido: renovar credenciales y reintentar. */
  | 'RENOVAR_CREDENCIALES'
  /** Configuración del emisor o del sistema: terminal hasta que alguien la corrija. */
  | 'CONFIGURACION'
  /** El documento está mal: rechazado, hay que emitir uno nuevo. */
  | 'DOCUMENTO'
  /** El SIN ya tiene algo con ese CUF / código: consultar su estado y adoptarlo. */
  | 'CONSULTAR'
  /** Plazos, fechas de envío o tamaño de paquete: error con alerta. */
  | 'ENVIO'
  | 'EVENTO'
  | 'ADVERTENCIA'
  | 'ANULACION'
  /** El servicio del SIN falló: reintentar con espera y, si persiste, contingencia. */
  | 'TRANSPORTE'
  | 'DESCONOCIDO';

const rango = (desde: number, hasta: number): number[] =>
  Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);

const CLASES: ReadonlyArray<readonly [AccionSiat, readonly number[]]> = [
  ['ESTADO', [901, 902, 903, 904, 905, 906, 907, 908, 909, 926, 978, 986, 987]],
  ['RENOVAR_CREDENCIALES', [913, 929, 973, 988, 914, 953, 123, 970, 980, 3008]],
  ['CONFIGURACION', [930, 959, 979, 989, 958]],
  [
    'DOCUMENTO',
    [
      910,
      911,
      912,
      915,
      916,
      917,
      918,
      919,
      931,
      932,
      933,
      1008,
      937,
      940,
      975,
      977,
      990,
      1016,
      1017,
      1007,
      961,
      962,
      963,
      964,
      965,
      3003,
      3004,
      3005,
      3006,
      3007,
      920,
      969,
      939,
      ...rango(1001, 1006),
      1009,
      1034,
      1035,
      1041,
      1051,
      1010,
      1011,
      1012,
      1013,
      1014,
      1015,
      1018,
      ...rango(1024, 1030),
      ...rango(1054, 1060),
      1036,
      1037,
      1023,
      938,
    ],
  ],
  ['CONSULTAR', [952, 1000, 944, 942, 923, 957]],
  ['ENVIO', [935, 943, 993, 983, 954, 956, 972, 985, 984, 1040, 971, 3009]],
  ['EVENTO', [950, 951, 960, 974, 981, 996, 976]],
  ['ADVERTENCIA', rango(2000, 2019)],
  ['ANULACION', [925, 934, 936, 941, 945, 968, 924, 946, 3010]],
  ['TRANSPORTE', [967, 991, 992, 995, 999]],
];

const POR_CODIGO = new Map<number, AccionSiat>();
for (const [accion, codigos] of CLASES) {
  for (const codigo of codigos) if (!POR_CODIGO.has(codigo)) POR_CODIGO.set(codigo, accion);
}

export function accionPara(codigo: number): AccionSiat {
  return POR_CODIGO.get(codigo) ?? 'DESCONOCIDO';
}

/** Estados de recepción del SIN. */
export const CODIGO_ESTADO = {
  PENDIENTE: 901,
  RECHAZADA: 902,
  OBSERVADA: 904,
  ANULACION_CONFIRMADA: 905,
  ANULACION_RECHAZADA: 906,
  VALIDADA: 908,
  COMUNICACION_EXITOSA: 926,
} as const;
