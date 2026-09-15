import { defineDomain, labelled } from '../../../common/catalog/domain';
import {
  BASES_DE_COMPUTO,
  ESTADOS_CONDICION,
  FRECUENCIAS,
  MEDIOS_DE_PAGO,
  MODALIDADES_DE_PAGO,
} from '../../accounting/supplier-payment-terms/payment-terms.catalog';

/**
 * Vocabulario de contabilidad.
 *
 * Los que ya tenían CHECK en la base lo declaran en `database`: la prueba de contrato compara la
 * lista con la migración y se pone en rojo si divergen.
 */

const fromCatalog = <T extends Record<string, { code: string; label: string; help: string }>>(
  source: T,
) =>
  Object.values(source).map((entry) => ({
    code: entry.code as Extract<keyof T, string>,
    label: entry.label,
    help: entry.help,
  }));

export const recordStatusDomain = defineDomain(
  'accounting.recordStatus',
  'Estado de un dato maestro contable (grupo de cuenta, plan, entidad).',
  labelled(['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const, {
    ACTIVE: { label: 'Activo', help: 'En uso: se puede elegir en cualquier alta o asiento nuevo.' },
    INACTIVE: {
      label: 'Inactivo',
      help: 'Deja de ofrecerse en pantallas nuevas; lo ya registrado no cambia.',
    },
    ARCHIVED: {
      label: 'Archivado',
      help: 'Retirado del catálogo; se conserva sólo para leer el histórico.',
    },
  }),
);

/*
 * `ARCHIVED` se añadió al CHECK el 2026-09-15 (migración de dominios alineados): el esquema lo
 * aceptaba desde el principio y el CHECK no, así que archivar una cuenta devolvía un 500.
 */
export const glAccountStatusDomain = defineDomain(
  'accounting.glAccountStatus',
  'Estado de una cuenta contable.',
  labelled(['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const, {
    ACTIVE: { label: 'Activa', help: 'Admite asientos y aparece en los selectores de imputación.' },
    INACTIVE: { label: 'Inactiva', help: 'No admite asientos nuevos; conserva su historial.' },
    ARCHIVED: { label: 'Archivada', help: 'Retirada del plan; sólo se consulta.' },
  }),
  [{ check: 'chk_gl_account_status' }],
);

export const businessPartnerStatusDomain = defineDomain(
  'accounting.businessPartnerStatus',
  'Estado de un business partner.',
  labelled(['ACTIVE', 'INACTIVE', 'BLOCKED', 'ARCHIVED'] as const, {
    ACTIVE: { label: 'Activo', help: 'Se le puede facturar, cobrar y pagar con normalidad.' },
    INACTIVE: {
      label: 'Inactivo',
      help: 'Sin operaciones en curso; elígelo para sacarlo de las listas sin borrarlo.',
    },
    BLOCKED: { label: 'Bloqueado', help: 'No se le puede facturar ni pagar hasta desbloquearlo.' },
    ARCHIVED: {
      label: 'Archivado',
      help: 'Relación terminada; se guarda sólo por obligación documental.',
    },
  }),
  [{ check: 'chk_bp_status' }],
);

export const glAccountTypeDomain = defineDomain(
  'accounting.glAccountType',
  'Naturaleza de una cuenta contable.',
  labelled(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE', 'CONTRA_ASSET'] as const, {
    ASSET: { label: 'Activo', help: 'Lo que la empresa posee o le deben: caja, bancos, cartera.' },
    LIABILITY: {
      label: 'Pasivo',
      help: 'Lo que la empresa debe a terceros: proveedores, impuestos, préstamos.',
    },
    EQUITY: {
      label: 'Patrimonio',
      help: 'Aportes de los socios y resultados que no se han distribuido.',
    },
    REVENUE: {
      label: 'Ingreso',
      help: 'Lo que la empresa gana por vender o prestar un servicio.',
    },
    EXPENSE: { label: 'Gasto', help: 'Lo que consume la operación: sueldos, alquiler, servicios.' },
    CONTRA_ASSET: { label: 'Contra-activo', help: 'Resta de un activo: depreciación, previsión.' },
  }),
  [{ check: 'chk_gl_account_type' }],
);

export const normalBalanceDomain = defineDomain(
  'accounting.normalBalance',
  'Lado en el que crece el saldo de una cuenta.',
  labelled(['D', 'C'] as const, {
    D: { label: 'Débito', help: 'El saldo aumenta por la izquierda: activos y gastos.' },
    C: {
      label: 'Crédito',
      help: 'El saldo aumenta por la derecha: pasivos, patrimonio, ingresos.',
    },
  }),
);

export const partnerTypeDomain = defineDomain(
  'accounting.partnerType',
  'Tipo de business partner.',
  labelled(['PERSON', 'COMPANY', 'BANK', 'GROUP_ENTITY', 'GOVERNMENT'] as const, {
    PERSON: {
      label: 'Persona',
      help: 'Un ser humano identificado por su cédula, no por un NIT de empresa.',
    },
    COMPANY: {
      label: 'Empresa',
      help: 'Sociedad o unipersonal con NIT propio ajena al grupo Atlas.',
    },
    BANK: {
      label: 'Banco',
      help: 'Entidad financiera con la que se opera: cuentas, préstamos, recaudación.',
    },
    GROUP_ENTITY: {
      label: 'Entidad del grupo',
      help: 'Otra empresa del mismo grupo; sus saldos se eliminan al consolidar.',
    },
    GOVERNMENT: {
      label: 'Entidad pública',
      help: 'Estado y sus dependencias: Impuestos, alcaldías, gestoras.',
    },
  }),
  [{ check: 'chk_bp_type' }],
);

export const kybStatusDomain = defineDomain(
  'accounting.kybStatus',
  'Estado de la verificación de conocimiento del cliente (KYB).',
  labelled(['PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED'] as const, {
    PENDING: { label: 'Pendiente', help: 'Falta reunir o cargar la documentación de respaldo.' },
    IN_REVIEW: {
      label: 'En revisión',
      help: 'Cumplimiento está analizando lo entregado; aún no hay veredicto.',
    },
    APPROVED: {
      label: 'Aprobado',
      help: 'Se verificó la identidad y la actividad; se puede operar sin restricción.',
    },
    REJECTED: {
      label: 'Rechazado',
      help: 'La verificación no pasó; exige un motivo y frena la operación.',
    },
  }),
);

export const statementTypeDomain = defineDomain(
  'accounting.statementType',
  'Estado financiero en el que se presenta un grupo de cuentas.',
  labelled(
    ['BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW', 'EQUITY_CHANGES', 'MEMORANDUM'] as const,
    {
      BALANCE_SHEET: {
        label: 'Balance general',
        help: 'Foto de lo que se tiene y se debe a una fecha; saldos acumulados.',
      },
      INCOME_STATEMENT: {
        label: 'Estado de resultados',
        help: 'Ingresos menos gastos de un período; el saldo se cierra cada gestión.',
      },
      CASH_FLOW: {
        label: 'Flujo de efectivo',
        help: 'Movimientos de caja y bancos por operación, inversión y financiamiento.',
      },
      EQUITY_CHANGES: {
        label: 'Cambios en el patrimonio',
        help: 'Aportes, retiros y resultados que mueven el capital de los socios.',
      },
      MEMORANDUM: {
        label: 'Cuentas de orden',
        help: 'Registros de control (garantías, avales) que no afectan al balance.',
      },
    },
  ),
  [{ check: 'chk_gl_account_group_statement' }],
);

export const accountClassificationDomain = defineDomain(
  'accounting.accountClassification',
  'Clasificación principal de un grupo de cuentas.',
  labelled(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const, {
    ASSET: { label: 'Activo', help: 'Agrupa recursos y derechos de cobro de la empresa.' },
    LIABILITY: { label: 'Pasivo', help: 'Agrupa las obligaciones con terceros.' },
    EQUITY: { label: 'Patrimonio', help: 'Agrupa capital, reservas y resultados de los socios.' },
    REVENUE: { label: 'Ingreso', help: 'Agrupa las cuentas que registran lo que se gana.' },
    EXPENSE: { label: 'Gasto', help: 'Agrupa las cuentas que registran lo que se consume.' },
  }),
  [{ check: 'chk_gl_account_group_classification' }],
);

/*
 * Medido en la base de dev el 2026-09-15: los grupos sembrados usan estos trece valores. Era texto
 * libre, así que la lista sale de lo que ya está guardado y no de lo que sugería el placeholder
 * («CURRENT / NON_CURRENT…»): cerrarlo a dos valores habría dejado sin editar diez grupos reales.
 */
export const accountSubClassificationDomain = defineDomain(
  'accounting.accountSubClassification',
  'Subclasificación de un grupo de cuentas dentro de su estado financiero.',
  labelled(
    [
      'CURRENT',
      'NON_CURRENT',
      'CAPITAL',
      'RESERVES',
      'RESULTS',
      'OCI',
      'OPERATING',
      'NON_OPERATING',
      'COST_OF_SERVICE',
      'FINANCIAL',
      'DEPRECIATION',
      'CREDIT_LOSS',
      'TAX',
    ] as const,
    {
      CURRENT: {
        label: 'Corriente',
        help: 'Se realiza o se paga dentro de los próximos doce meses.',
      },
      NON_CURRENT: {
        label: 'No corriente',
        help: 'Se realiza o se paga después de un año: activo fijo, deuda larga.',
      },
      CAPITAL: {
        label: 'Capital',
        help: 'Aportes de los socios y capital suscrito de la sociedad.',
      },
      RESERVES: {
        label: 'Reservas',
        help: 'Utilidades retenidas por ley o por decisión de la junta.',
      },
      RESULTS: {
        label: 'Resultados acumulados',
        help: 'Ganancias y pérdidas de gestiones anteriores aún sin destino.',
      },
      OCI: {
        label: 'Otro resultado integral',
        help: 'Partidas que no pasan por resultados (ORI).',
      },
      OPERATING: {
        label: 'Operativo',
        help: 'Ingresos y gastos propios del giro habitual del negocio.',
      },
      NON_OPERATING: {
        label: 'No operativo',
        help: 'Ingresos y gastos ajenos al giro: venta de activos, otros.',
      },
      COST_OF_SERVICE: {
        label: 'Costo del servicio',
        help: 'Lo que cuesta directamente prestar el servicio que se factura.',
      },
      FINANCIAL: {
        label: 'Financiero',
        help: 'Intereses, comisiones bancarias y diferencia de cambio.',
      },
      DEPRECIATION: {
        label: 'Depreciación y amortización',
        help: 'Desgaste del activo fijo e intangible imputado a la gestión.',
      },
      CREDIT_LOSS: {
        label: 'Pérdida crediticia',
        help: 'Previsión y castigo de cartera que no se espera recuperar.',
      },
      TAX: {
        label: 'Impuestos',
        help: 'Cargas tributarias del período: IVA, IT, IUE y afines.',
      },
    },
  ),
);

export const entityLinkTypeDomain = defineDomain(
  'accounting.entityLinkType',
  'A qué clase de registro se ata una cuenta o un asiento.',
  labelled(
    [
      'BUSINESS_PARTNER',
      'COST_CENTER',
      'PROFIT_CENTER',
      'CONTRACT',
      'LEGAL_ENTITY',
      'TAX_CODE',
      'BANK_ACCOUNT',
      'LEDGER',
      'BRANCH',
      'ACCOUNTING_DOCUMENT',
      'OTHER',
    ] as const,
    {
      BUSINESS_PARTNER: {
        label: 'Business partner',
        help: 'El tercero con el que se opera: cliente, proveedor, banco.',
      },
      COST_CENTER: {
        label: 'Centro de costo',
        help: 'El área que consume el gasto; sirve para repartirlo.',
      },
      PROFIT_CENTER: {
        label: 'Centro de beneficio',
        help: 'La unidad a la que se le mide el resultado, no sólo el gasto.',
      },
      CONTRACT: {
        label: 'Contrato',
        help: 'El acuerdo que origina el cobro o el pago recurrente.',
      },
      LEGAL_ENTITY: {
        label: 'Entidad legal',
        help: 'La empresa del grupo dueña del registro, con su propio NIT.',
      },
      TAX_CODE: {
        label: 'Código de impuesto',
        help: 'La regla tributaria que determina la alícuota aplicada.',
      },
      BANK_ACCOUNT: {
        label: 'Cuenta bancaria',
        help: 'La cuenta concreta por donde entra o sale el dinero.',
      },
      LEDGER: {
        label: 'Ledger',
        help: 'El libro contable (local, gestión o NIIF) al que pertenece.',
      },
      BRANCH: {
        label: 'Sucursal',
        help: 'El punto de venta o la oficina donde ocurrió el hecho.',
      },
      ACCOUNTING_DOCUMENT: {
        label: 'Documento contable',
        help: 'Otro comprobante ya registrado, cuando el vínculo es entre documentos.',
      },
      OTHER: {
        label: 'Otro',
        help: 'Nada de lo anterior encaja; conviene detallarlo en la glosa.',
      },
    },
  ),
);

export const entityLinkRelationDomain = defineDomain(
  'accounting.entityLinkRelation',
  'Para qué se ata una cuenta a otro registro.',
  labelled(
    [
      'DEFAULT',
      'AR_CONTROL',
      'AP_CONTROL',
      'ADVANCE',
      'SURCHARGE',
      'REVENUE',
      'EXPENSE',
      'TAX',
    ] as const,
    {
      DEFAULT: {
        label: 'Por defecto',
        help: 'La cuenta que se propone si nada más la sobreescribe.',
      },
      AR_CONTROL: {
        label: 'Cuentas por cobrar (control)',
        help: 'Concentra lo que el tercero adeuda a la empresa.',
      },
      AP_CONTROL: {
        label: 'Cuentas por pagar (control)',
        help: 'Concentra lo que la empresa adeuda a ese tercero.',
      },
      ADVANCE: {
        label: 'Anticipos',
        help: 'Dinero entregado o recibido antes de que exista la factura.',
      },
      SURCHARGE: {
        label: 'Recargos',
        help: 'Intereses por mora y cargos añadidos al importe original.',
      },
      REVENUE: {
        label: 'Ingreso',
        help: 'Dónde se reconoce lo que se gana con ese tercero o contrato.',
      },
      EXPENSE: {
        label: 'Gasto',
        help: 'Dónde se imputa lo que se consume con ese tercero o contrato.',
      },
      TAX: {
        label: 'Impuesto',
        help: 'Dónde caen el IVA, el IT o la retención de esa operación.',
      },
    },
  ),
);

export const partnerAccountPurposeDomain = defineDomain(
  'accounting.partnerAccountPurpose',
  'Para qué usa un business partner cada cuenta por defecto.',
  labelled(
    [
      'AR_CONTROL',
      'AP_CONTROL',
      'CUSTOMER_ADVANCES',
      'SUPPLIER_ADVANCES',
      'SURCHARGES',
      'DISCOUNTS',
      'WITHHOLDINGS',
    ] as const,
    {
      AR_CONTROL: {
        label: 'Cuentas por cobrar (control)',
        help: 'Cuenta donde se acumula la deuda que ese cliente tiene.',
      },
      AP_CONTROL: {
        label: 'Cuentas por pagar (control)',
        help: 'Cuenta donde se acumula lo que se le debe a ese proveedor.',
      },
      CUSTOMER_ADVANCES: {
        label: 'Anticipos de cliente',
        help: 'Cobros recibidos antes de emitir la factura; son un pasivo.',
      },
      SUPPLIER_ADVANCES: {
        label: 'Anticipos a proveedor',
        help: 'Pagos entregados antes de recibir el bien; son un activo.',
      },
      SURCHARGES: {
        label: 'Recargos',
        help: 'Intereses y penalidades que se le cargan por atraso.',
      },
      DISCOUNTS: {
        label: 'Descuentos',
        help: 'Rebajas concedidas por pronto pago o por volumen.',
      },
      WITHHOLDINGS: {
        label: 'Retenciones',
        help: 'Impuesto retenido al pagarle y que se entera al fisco.',
      },
    },
  ),
);

export const partnerRoleDomain = defineDomain(
  'accounting.partnerRole',
  'Papel que cumple un business partner frente a una entidad legal.',
  labelled(['CUSTOMER', 'SUPPLIER', 'MERCHANT', 'LENDER', 'BANK', 'INTERCOMPANY'] as const, {
    CUSTOMER: { label: 'Cliente', help: 'Se le factura y se le cobra por lo vendido.' },
    SUPPLIER: { label: 'Proveedor', help: 'Emite facturas de compra que hay que pagarle.' },
    MERCHANT: {
      label: 'Comercio afiliado',
      help: 'Vende con Atlas y liquida comisión sobre lo que coloca.',
    },
    LENDER: {
      label: 'Prestamista',
      help: 'Financia a la empresa; se le devuelve capital e intereses.',
    },
    BANK: {
      label: 'Banco',
      help: 'Custodia el efectivo y procesa cobros, pagos y QR.',
    },
    INTERCOMPANY: {
      label: 'Empresa del grupo',
      help: 'Se opera con ella pero su saldo se elimina al consolidar.',
    },
  }),
);

export const ledgerBasisDomain = defineDomain(
  'accounting.ledgerBasis',
  'Norma contable con la que lleva el libro un ledger.',
  labelled(['LOCAL_BO', 'MANAGEMENT', 'IFRS'] as const, {
    LOCAL_BO: {
      label: 'Norma local (Bolivia)',
      help: 'El libro que se presenta a Impuestos Nacionales y a Fundempresa.',
    },
    MANAGEMENT: {
      label: 'Gestión interna',
      help: 'Libro para decidir dentro de casa; no se presenta a nadie.',
    },
    IFRS: {
      label: 'NIIF (IFRS)',
      help: 'Norma internacional; se usa para reportar a casa matriz o inversores.',
    },
  }),
  [{ check: 'chk_ledger_accounting_basis' }],
);

export const taxTypeDomain = defineDomain(
  'accounting.taxType',
  'Impuesto que representa un código tributario.',
  labelled(['IVA', 'IT', 'IUE', 'RETENTION', 'OTHER'] as const, {
    IVA: {
      label: 'IVA — Impuesto al Valor Agregado',
      help: 'Grava la venta al 13 % y se compensa con el crédito fiscal de compras.',
    },
    IT: {
      label: 'IT — Impuesto a las Transacciones',
      help: 'Grava el ingreso bruto al 3 %; se compensa contra el IUE pagado.',
    },
    IUE: {
      label: 'IUE — Impuesto sobre las Utilidades',
      help: 'Grava la utilidad de la gestión al 25 %; se liquida al cierre anual.',
    },
    RETENTION: {
      label: 'Retención',
      help: 'Se descuenta al pagar a quien no factura y se entera al fisco.',
    },
    OTHER: {
      label: 'Otro',
      help: 'Tributo municipal o sectorial que no encaja en los anteriores.',
    },
  }),
);

export const accountingContractTypeDomain = defineDomain(
  'accounting.contractType',
  'Clase de contrato contable.',
  labelled(['CUSTOMER_BILLING', 'SUPPLIER', 'LOAN', 'INTERCOMPANY', 'MERCHANT'] as const, {
    CUSTOMER_BILLING: {
      label: 'Facturación a cliente',
      help: 'Genera las facturas periódicas que se le cobran al cliente.',
    },
    SUPPLIER: {
      label: 'Proveedor',
      help: 'Fija qué y cómo se le compra y paga a un tercero.',
    },
    LOAN: {
      label: 'Préstamo',
      help: 'Deuda con calendario de capital e intereses a devengar.',
    },
    INTERCOMPANY: {
      label: 'Entre empresas del grupo',
      help: 'Servicios cruzados entre entidades que luego se eliminan.',
    },
    MERCHANT: {
      label: 'Comercio afiliado',
      help: 'Acuerdo de comisión y liquidación con un comercio de Atlas.',
    },
  }),
);

/*
 * `contract_header.status` no tiene CHECK en la base; la validación vive sólo aquí. Por eso el
 * PATCH de contratos, que no validaba, llegó a aceptar cualquier cadena.
 */
export const accountingContractStatusDomain = defineDomain(
  'accounting.contractStatus',
  'Estado de un contrato contable.',
  labelled(['DRAFT', 'ACTIVE', 'SUSPENDED', 'TERMINATED'] as const, {
    DRAFT: { label: 'Borrador', help: 'Aún se redacta; no genera facturas ni obligaciones.' },
    ACTIVE: { label: 'Vigente', help: 'En ejecución: devenga y factura según lo pactado.' },
    SUSPENDED: {
      label: 'Suspendido',
      help: 'Se detiene la facturación sin cerrarlo; puede reanudarse.',
    },
    TERMINATED: {
      label: 'Terminado',
      help: 'Concluido o rescindido; ya no devenga nada nuevo.',
    },
  }),
);

export const billingEventTypeDomain = defineDomain(
  'accounting.billingEventType',
  'Qué origina un evento de facturación.',
  labelled(['MDR', 'SAAS', 'SETUP', 'INTERCOMPANY', 'SUPPORT'] as const, {
    MDR: { label: 'Comisión por venta (MDR)', help: 'Porcentaje sobre lo que vende el comercio.' },
    SAAS: {
      label: 'Suscripción',
      help: 'Cuota fija periódica por el uso de la plataforma.',
    },
    SETUP: {
      label: 'Cargo de alta',
      help: 'Cobro único por habilitar al comercio la primera vez.',
    },
    INTERCOMPANY: {
      label: 'Servicio entre empresas del grupo',
      help: 'Cargo que una entidad del grupo le hace a otra.',
    },
    SUPPORT: {
      label: 'Soporte',
      help: 'Atención o desarrollo facturado aparte del plan.',
    },
  }),
);

export const arInvoiceStatusDomain = defineDomain(
  'accounting.arInvoiceStatus',
  'Estado de una factura por cobrar.',
  labelled(['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'CREDITED', 'VOID'] as const, {
    DRAFT: { label: 'Borrador', help: 'Todavía se puede editar; no genera cuenta por cobrar.' },
    ISSUED: { label: 'Emitida', help: 'Entregada al cliente y contabilizada; espera el cobro.' },
    PARTIALLY_PAID: {
      label: 'Pagada en parte',
      help: 'Se cobró una porción; queda saldo pendiente.',
    },
    PAID: { label: 'Pagada', help: 'Cobrada en su totalidad; no queda saldo.' },
    CREDITED: { label: 'Acreditada', help: 'Anulada total o parcialmente con nota de crédito.' },
    VOID: {
      label: 'Anulada',
      help: 'Se dejó sin efecto antes de cobrarla; no cuenta como ingreso.',
    },
  }),
  [{ check: 'chk_ar_invoice_status' }],
);

export const receiptStatusDomain = defineDomain(
  'accounting.receiptStatus',
  'Estado de un recibo de cobro.',
  labelled(['DRAFT', 'RECORDED', 'POSTED', 'VOID'] as const, {
    DRAFT: { label: 'Borrador', help: 'Se está capturando; aún no descuenta deuda del cliente.' },
    RECORDED: {
      label: 'Registrado',
      help: 'El cobro está capturado y aplicado, pero sin asiento aún.',
    },
    POSTED: {
      label: 'Contabilizado',
      help: 'Ya generó su asiento en el libro y afecta los saldos.',
    },
    VOID: { label: 'Anulado', help: 'Se revirtió el cobro; la deuda vuelve a quedar abierta.' },
  }),
  [{ check: 'chk_receipt_status' }],
);

export const documentApprovalStatusDomain = defineDomain(
  'accounting.documentApprovalStatus',
  'Estado de aprobación de un documento contable.',
  labelled(['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED'] as const, {
    NOT_REQUIRED: {
      label: 'No requiere aprobación',
      help: 'Por su importe o tipo pasa directo a contabilizarse.',
    },
    PENDING: {
      label: 'Pendiente de aprobación',
      help: 'Espera la firma de quien tiene la facultad para autorizarlo.',
    },
    APPROVED: {
      label: 'Aprobado',
      help: 'Autorizado; ya puede contabilizarse y pagarse.',
    },
    REJECTED: {
      label: 'Rechazado',
      help: 'Devuelto a quien lo cargó; exige corregir y volver a enviar.',
    },
  }),
  [{ check: 'chk_accounting_document_approval_status' }],
);

/*
 * Sistema, tipo de origen y tipo de documento. Son la clave de integración de un documento y el
 * esquema NO los cierra (un importador elige los suyos); estos dominios son los valores habituales
 * que el alta manual ofrece en un select. El backend los escribe fijos desde facturación, tesorería,
 * CRM y reversiones. La lista es la unión
 * de lo que escribe el código y de lo medido en dev. `SMOKE`/`BATCH_VALIDATION` son del guion de
 * humo de lotes, que también pasa por el esquema.
 */
export const documentSourceSystemDomain = defineDomain(
  'accounting.documentSourceSystem',
  'Sistema que origina un documento contable.',
  labelled(['ATLAS_ERP', 'ACCOUNTING', 'BILLING', 'TREASURY', 'CRM', 'ADS', 'SMOKE'] as const, {
    ATLAS_ERP: {
      label: 'ERP Atlas',
      help: 'Lo escribió el propio ERP sin poder atribuirlo a un módulo concreto.',
    },
    ACCOUNTING: {
      label: 'Contabilidad (manual)',
      help: 'Lo cargó una persona desde las pantallas de contabilidad.',
    },
    BILLING: {
      label: 'Facturación',
      help: 'Nació del proceso que emite facturas a clientes y comercios.',
    },
    TREASURY: {
      label: 'Tesorería',
      help: 'Nació de un cobro, un pago o un movimiento bancario.',
    },
    CRM: {
      label: 'CRM comercial',
      help: 'Nació del circuito de ventas B2B: contratos, propuestas, liquidaciones.',
    },
    ADS: {
      label: 'Publicidad',
      help: 'Nació del consumo publicitario de un anunciante.',
    },
    SMOKE: { label: 'Prueba técnica', help: 'Sólo para las pruebas de humo del sistema.' },
  }),
);

export const documentSourceTypeDomain = defineDomain(
  'accounting.documentSourceType',
  'Clase de hecho que origina un documento contable.',
  labelled(
    [
      'MANUAL',
      'AR_INVOICE',
      'RECEIPT',
      'MERCHANT_INVOICE',
      'REVERSAL',
      'CLOSING',
      'BATCH_VALIDATION',
    ] as const,
    {
      MANUAL: {
        label: 'Asiento manual',
        help: 'Lo tecleó una persona; no lo respalda otro documento del sistema.',
      },
      AR_INVOICE: {
        label: 'Factura por cobrar',
        help: 'Lo originó la emisión de una factura a un cliente.',
      },
      RECEIPT: {
        label: 'Recibo de cobro',
        help: 'Lo originó el cobro de una o varias facturas.',
      },
      MERCHANT_INVOICE: {
        label: 'Factura a comercio',
        help: 'Lo originó la liquidación de comisiones a un comercio afiliado.',
      },
      REVERSAL: {
        label: 'Reversión',
        help: 'Deshace un asiento anterior con los importes invertidos.',
      },
      CLOSING: {
        label: 'Cierre de período',
        help: 'Lo generó el proceso que traslada resultados al patrimonio.',
      },
      BATCH_VALIDATION: { label: 'Prueba técnica', help: 'Sólo para las pruebas de humo.' },
    },
  ),
);

export const documentTypeDomain = defineDomain(
  'accounting.documentType',
  'Tipo de documento contable.',
  labelled(['JOURNAL', 'AR_INVOICE', 'RECEIPT', 'REVERSAL', 'ADJUSTMENT', 'CLOSING'] as const, {
    JOURNAL: {
      label: 'Asiento de diario',
      help: 'Registro contable genérico de partida doble.',
    },
    AR_INVOICE: {
      label: 'Factura por cobrar',
      help: 'Comprobante que reconoce el ingreso y la deuda del cliente.',
    },
    RECEIPT: {
      label: 'Recibo',
      help: 'Comprobante de que entró el dinero y bajó la cartera.',
    },
    REVERSAL: {
      label: 'Reversión',
      help: 'Anula un documento previo sin borrarlo del libro.',
    },
    ADJUSTMENT: {
      label: 'Ajuste',
      help: 'Corrige saldos por diferencias, provisiones o reclasificaciones.',
    },
    CLOSING: {
      label: 'Cierre',
      help: 'Salda las cuentas de resultado al terminar el período.',
    },
  }),
);

/* Estados del SIAT (Servicio de Impuestos Nacionales) para la factura electrónica. */
export const siatStatusDomain = defineDomain(
  'accounting.siatStatus',
  'Estado de la factura electrónica ante el SIAT.',
  labelled(['PENDING', 'SENT', 'ACCEPTED', 'OBSERVED', 'REJECTED', 'VOIDED'] as const, {
    PENDING: {
      label: 'Pendiente de envío',
      help: 'Emitida en el ERP pero todavía no transmitida a Impuestos.',
    },
    SENT: {
      label: 'Enviada',
      help: 'Transmitida al SIAT; falta la respuesta de validación.',
    },
    ACCEPTED: {
      label: 'Aceptada',
      help: 'Impuestos la validó; tiene CUF vigente y respalda crédito fiscal.',
    },
    OBSERVED: {
      label: 'Observada',
      help: 'El SIAT halló inconsistencias; hay que corregir y reenviar.',
    },
    REJECTED: {
      label: 'Rechazada',
      help: 'Impuestos no la admitió; no vale como respaldo tributario.',
    },
    VOIDED: {
      label: 'Anulada ante el SIAT',
      help: 'Se comunicó su anulación dentro del plazo que fija la norma.',
    },
  }),
);

export const periodCloseTypeDomain = defineDomain(
  'accounting.periodCloseType',
  'Alcance de un cierre contable.',
  labelled(['MONTHLY', 'ANNUAL'] as const, {
    MONTHLY: {
      label: 'Mensual',
      help: 'Bloquea el mes para que nadie altere lo ya informado.',
    },
    ANNUAL: {
      label: 'Anual',
      help: 'Cierra la gestión, liquida el IUE y traslada el resultado.',
    },
  }),
);

export const paymentTermModalityDomain = defineDomain(
  'accounting.paymentTermModality',
  'Cuándo nace la obligación de pagar a un proveedor.',
  fromCatalog(MODALIDADES_DE_PAGO),
  [{ check: 'ck_supplier_terms_modality' }],
);

export const paymentTermBaseDomain = defineDomain(
  'accounting.paymentTermBase',
  'Desde qué fecha corre el plazo de pago.',
  fromCatalog(BASES_DE_COMPUTO),
  [{ check: 'ck_supplier_terms_base' }],
);

export const paymentMethodDomain = defineDomain(
  'accounting.paymentMethod',
  'Instrumento con el que se paga o se cobra.',
  fromCatalog(MEDIOS_DE_PAGO),
  [{ check: 'ck_supplier_terms_method' }],
);

export const paymentFrequencyDomain = defineDomain(
  'accounting.paymentFrequency',
  'Cada cuánto se repite un pago.',
  fromCatalog(FRECUENCIAS),
  [{ check: 'ck_supplier_terms_frequency' }],
);

export const paymentTermStatusDomain = defineDomain(
  'accounting.paymentTermStatus',
  'Ciclo de vida de una condición de pago a proveedor.',
  fromCatalog(ESTADOS_CONDICION),
  [{ check: 'ck_supplier_terms_status' }],
);

export const ACCOUNTING_DOMAINS = [
  recordStatusDomain,
  glAccountStatusDomain,
  businessPartnerStatusDomain,
  glAccountTypeDomain,
  normalBalanceDomain,
  partnerTypeDomain,
  kybStatusDomain,
  statementTypeDomain,
  accountClassificationDomain,
  accountSubClassificationDomain,
  entityLinkTypeDomain,
  entityLinkRelationDomain,
  partnerAccountPurposeDomain,
  partnerRoleDomain,
  ledgerBasisDomain,
  taxTypeDomain,
  accountingContractTypeDomain,
  accountingContractStatusDomain,
  billingEventTypeDomain,
  arInvoiceStatusDomain,
  receiptStatusDomain,
  documentApprovalStatusDomain,
  documentSourceSystemDomain,
  documentSourceTypeDomain,
  documentTypeDomain,
  siatStatusDomain,
  periodCloseTypeDomain,
  paymentTermModalityDomain,
  paymentTermBaseDomain,
  paymentMethodDomain,
  paymentFrequencyDomain,
  paymentTermStatusDomain,
] as const;
