import type { AttributeVocabulary, FactContext } from '../../../common/segmentation/rule-engine';

/**
 * Segmentación comercial: a QUIÉN agrupa cada segmento del ERP.
 *
 * ## El equívoco que cierra
 *
 * Hasta aquí el ERP tenía una sola cosa llamada «segmento» —la audiencia publicitaria— y tres
 * poblaciones de personas que no se parecen en nada:
 *
 * - el **usuario ERP** (`internal_users`), que es quien opera el sistema;
 * - el **partner** (`b2b_accounts`), que es el comercio o aliado con el que hay contrato;
 * - el **cliente solicitante de crédito**, que es quien compra a plazos en ese comercio.
 *
 * Al llamarse todo «usuarios» en el menú, la pantalla de Seguridad y la de Segmentos parecían dos
 * vistas de lo mismo, y no lo son: **el usuario ERP no se segmenta, se administra**. Un segmento
 * agrupa población de negocio; un usuario interno tiene rol y permisos. Por eso el sujeto es una
 * columna de la tabla y no un comentario: un segmento sin sujeto declarado es un segmento del que
 * no se sabe a quién cuenta.
 *
 * El único punto donde el usuario ERP toca un segmento es como DUEÑO: quién lo mantiene. Nunca
 * como miembro.
 *
 * ## Por qué el vocabulario también aquí es cerrado
 *
 * Por lo mismo que en publicidad, y con más motivo: el solicitante de crédito es una persona. En
 * el ERP su identidad es deliberadamente opaca —`consumers_ref` guarda un id y una referencia
 * externa, nada más—, así que un segmento de solicitantes sólo puede mirar hechos de su
 * COMPORTAMIENTO de crédito: en qué banda de riesgo se originó, cuánto financió, cuánto lleva de
 * mora. Ninguno de estos atributos nombra a nadie, y ninguno se puede añadir sin tocar esta lista.
 */

export const SEGMENT_SUBJECTS = ['CREDIT_APPLICANT', 'PARTNER'] as const;
export type SegmentSubject = (typeof SEGMENT_SUBJECTS)[number];

/**
 * Lo que se sabe de un partner. Sale de su cuenta B2B y de lo que ya se le ha facturado: nada se
 * declara desde fuera.
 *
 * `riskTier` es la clasificación COMERCIAL que se le puso a la cuenta al darla de alta;
 * `ratingGrade` es la que calcula el motor de riesgo a partir de la mora real y se proyecta sobre
 * la cuenta (`risk_rating_grade`). Son dos cosas distintas y las dos se pueden segmentar: la
 * primera dice qué se esperaba del comercio y la segunda qué está pasando.
 */
export const PARTNER_ATTRIBUTES = {
  accountType: 'TEXT',
  lifecycleStatus: 'TEXT',
  industry: 'TEXT',
  category: 'TEXT',
  city: 'TEXT',
  countryCode: 'TEXT',
  territory: 'TEXT',
  riskTier: 'TEXT',
  /** La que calcula el motor de riesgo por la mora real, proyectada sobre la cuenta. */
  ratingGrade: 'TEXT',
  /** Una cuenta puede llevar VARIOS tags a la vez: «igual a X» significa «lleva el tag X». */
  tag: 'TEXT_LIST',
  sizeBand: 'TEXT',
  expectedMonthlyVolume: 'NUMBER',
  openDebtAmount: 'NUMBER',
  tenureMonths: 'NUMBER',
  branchCount: 'NUMBER',
} as const satisfies AttributeVocabulary;

/**
 * Lo que se sabe de un cliente solicitante de crédito.
 *
 * Todo es comportamiento agregado de sus compras a plazos. `merchantCategory` y `merchantCity` son
 * del COMERCIO donde compró —no del cliente—, y por eso se llaman así: son la respuesta a «los que
 * financian en farmacias», que es una pregunta sobre el canal, no sobre la persona.
 */
export const CREDIT_APPLICANT_ATTRIBUTES = {
  riskTierAtOrigination: 'TEXT',
  cohortId: 'TEXT',
  merchantCategory: 'TEXT',
  merchantCity: 'TEXT',
  purchaseCount: 'NUMBER',
  financedAmount: 'NUMBER',
  overdueInstallmentCount: 'NUMBER',
  maxDaysPastDue: 'NUMBER',
  openRecoveryCount: 'NUMBER',
  monthsSinceFirstPurchase: 'NUMBER',
} as const satisfies AttributeVocabulary;

export type PartnerAttribute = keyof typeof PARTNER_ATTRIBUTES;
export type CreditApplicantAttribute = keyof typeof CREDIT_APPLICANT_ATTRIBUTES;
export type CrmSegmentAttribute = PartnerAttribute | CreditApplicantAttribute;

/**
 * El vocabulario COMPLETO, para validar la forma de una regla antes de saber de qué sujeto es.
 *
 * Ningún nombre se repite entre sujetos a propósito: `city` es del partner y `merchantCity` es del
 * comercio donde compró el solicitante. Si un mismo nombre significara dos cosas según el sujeto,
 * un segmento copiado de un sujeto a otro seguiría validando y contaría otra población.
 */
export const CRM_SEGMENT_ATTRIBUTES = {
  ...PARTNER_ATTRIBUTES,
  ...CREDIT_APPLICANT_ATTRIBUTES,
} as const satisfies AttributeVocabulary;

export const ATTRIBUTES_BY_SUBJECT: Record<SegmentSubject, readonly CrmSegmentAttribute[]> = {
  PARTNER: Object.keys(PARTNER_ATTRIBUTES) as PartnerAttribute[],
  CREDIT_APPLICANT: Object.keys(CREDIT_APPLICANT_ATTRIBUTES) as CreditApplicantAttribute[],
};

/**
 * Cómo se nombra cada sujeto cuando lo va a leer una persona.
 *
 * Dos formas porque se usan en dos sitios: `SUBJECT_LABELS` cae dentro de una frase («un segmento
 * DE PARTNERS no puede mirar…») y `SUBJECT_NAMES` encabeza una columna o una opción, donde el
 * genitivo sobra.
 */
export const SUBJECT_LABELS: Record<SegmentSubject, string> = {
  PARTNER: 'de partners',
  CREDIT_APPLICANT: 'de clientes solicitantes de crédito',
};

export const SUBJECT_NAMES: Record<SegmentSubject, string> = {
  PARTNER: 'Partner',
  CREDIT_APPLICANT: 'Cliente solicitante',
};

/** Los hechos de un sujeto concreto, ya proyectados y listos para evaluar. */
export interface SubjectFacts {
  /** Identificador del sujeto: la cuenta B2B, o el id OPACO del solicitante. */
  readonly id: string;
  /** Cómo se muestra en pantalla. Para un solicitante NUNCA es un nombre: es su referencia. */
  readonly label: string;
  readonly facts: FactContext<CrmSegmentAttribute>;
}

/**
 * Cómo se llama cada atributo en pantalla.
 *
 * Vive junto al vocabulario y no en el frontend a propósito: la lista de atributos y sus nombres
 * cambian a la vez, y teniéndolos en dos repositorios el desplegable acaba ofreciendo un atributo
 * que el backend ya no admite —o escondiendo uno nuevo— sin que nada falle al compilar.
 */
export const ATTRIBUTE_LABELS: Record<CrmSegmentAttribute, string> = {
  accountType: 'Tipo de cuenta',
  lifecycleStatus: 'Estado del ciclo de vida',
  industry: 'Industria',
  category: 'Rubro',
  city: 'Ciudad',
  countryCode: 'País',
  territory: 'Territorio',
  riskTier: 'Nivel de riesgo comercial',
  ratingGrade: 'Categoría de riesgo calculada (A–F)',
  tag: 'Tag de clasificación',
  sizeBand: 'Banda de tamaño',
  expectedMonthlyVolume: 'Volumen mensual esperado (Bs)',
  openDebtAmount: 'Deuda abierta con Atlas (Bs)',
  tenureMonths: 'Antigüedad en la plataforma (meses)',
  branchCount: 'Sucursales',
  riskTierAtOrigination: 'Banda de riesgo al originar',
  cohortId: 'Cohorte',
  merchantCategory: 'Rubro del comercio donde compró',
  merchantCity: 'Ciudad del comercio donde compró',
  purchaseCount: 'Compras a plazos',
  financedAmount: 'Monto financiado (Bs)',
  overdueInstallmentCount: 'Cuotas en mora',
  maxDaysPastDue: 'Días de mora máximos',
  openRecoveryCount: 'Recuperaciones abiertas',
  monthsSinceFirstPurchase: 'Meses desde la primera compra',
};

/** El vocabulario tal y como lo necesita una pantalla: por sujeto, con nombre y naturaleza. */
export function segmentVocabulary(): Array<{
  subject: SegmentSubject;
  subjectName: string;
  subjectLabel: string;
  attributes: Array<{ name: CrmSegmentAttribute; label: string; kind: string }>;
}> {
  return SEGMENT_SUBJECTS.map((subject) => ({
    subject,
    subjectName: SUBJECT_NAMES[subject],
    subjectLabel: SUBJECT_LABELS[subject],
    attributes: ATTRIBUTES_BY_SUBJECT[subject].map((name) => ({
      name,
      label: ATTRIBUTE_LABELS[name],
      kind: CRM_SEGMENT_ATTRIBUTES[name],
    })),
  }));
}
