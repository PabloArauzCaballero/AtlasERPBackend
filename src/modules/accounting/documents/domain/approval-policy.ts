import { ConflictException, UnprocessableEntityException } from '@nestjs/common';

/**
 * Política de aprobación del documento contable, decidida por el SERVIDOR (ATL-03 / DEC-10).
 *
 * El cliente ya no escoge si su documento necesita aprobación: `approvalStatus` del body deja de ser
 * una fuente de verdad. La necesidad de aprobar sale de (a) los hechos que conoce el servidor —el
 * ORIGEN de la llamada, que decide el código de quien invoca y nunca un campo del body— y (b) la
 * política configurada en el despliegue.
 *
 * DEC-10 (quién aprueba, umbrales, vigencia) sigue ABIERTA y sin aprobación de finanzas. Por eso:
 *   - sin política configurada, un documento MANUAL no se crea: `UNAVAILABLE`, nunca `NOT_REQUIRED`;
 *   - la única política que existe es la conservadora de la opción 1 de DEC-10 («todo asiento
 *     manual lo aprueba otra persona»), SIN umbrales de importe, y se activa explícitamente con
 *     `ACCOUNTING_APPROVAL_POLICY`. Es una política PROVISIONAL, no una decisión de negocio: su
 *     referencia se guarda en cada documento para poder auditar cuáles nacieron bajo ella.
 */
export type ApprovalOrigin = 'MANUAL' | 'SERVER_GENERATED';

export interface ApprovalFacts {
  /** Lo fija el código de quien llama a `createDraftInTransaction`; el body no tiene voz aquí. */
  origin: ApprovalOrigin;
}

export type ApprovalPolicyDecision =
  | { outcome: 'REQUIRED'; policyRef: string; reason: string }
  | { outcome: 'NOT_REQUIRED'; policyRef: string; reason: string }
  | { outcome: 'UNAVAILABLE'; reason: string };

export const APPROVAL_POLICY_IDS = ['ALL_MANUAL_REQUIRE_APPROVAL'] as const;
export type ApprovalPolicyId = (typeof APPROVAL_POLICY_IDS)[number];

/** Versionado explícito: cambiar la regla exige subir el sufijo, no editar en sitio. */
export const ALL_MANUAL_POLICY_REF = 'ALL_MANUAL_REQUIRE_APPROVAL@1';
/**
 * Documentos que el sistema deriva de un hecho de negocio (reverso, recibo, factura, puente del
 * CRM). Siguen sin aprobación como antes de este cambio; lo que cambia es que ahora lo dice una
 * regla del servidor con referencia, no una cadena que cualquiera puede enviar. Su tratamiento
 * definitivo (fila «Automáticos» de DEC-10) sigue pendiente de finanzas.
 */
export const SERVER_GENERATED_POLICY_REF = 'SERVER_GENERATED_DOCUMENT@1';

export function isKnownApprovalPolicy(value: string | undefined): value is ApprovalPolicyId {
  return (APPROVAL_POLICY_IDS as readonly string[]).includes(value ?? '');
}

/** Determinista: mismos hechos y misma política ⇒ misma decisión. La falta de política NO exime. */
export function evaluateApprovalPolicy(
  facts: ApprovalFacts,
  configuredPolicy: string | undefined,
): ApprovalPolicyDecision {
  if (facts.origin === 'SERVER_GENERATED') {
    return {
      outcome: 'NOT_REQUIRED',
      policyRef: SERVER_GENERATED_POLICY_REF,
      reason: 'Documento generado por el servidor a partir de un hecho de negocio.',
    };
  }
  if (configuredPolicy === undefined || configuredPolicy === '') {
    return {
      outcome: 'UNAVAILABLE',
      reason: 'No hay política de aprobación configurada (DEC-10 sin decidir).',
    };
  }
  if (!isKnownApprovalPolicy(configuredPolicy)) {
    return {
      outcome: 'UNAVAILABLE',
      reason: `La política de aprobación configurada no existe: ${configuredPolicy}.`,
    };
  }
  return {
    outcome: 'REQUIRED',
    policyRef: ALL_MANUAL_POLICY_REF,
    reason: 'Todo documento contable manual requiere la aprobación de otra persona.',
  };
}

const DECISION_TO_STATUS = { REQUIRED: 'PENDING', NOT_REQUIRED: 'NOT_REQUIRED' } as const;

export interface ResolvedApproval {
  approvalStatus: 'PENDING' | 'NOT_REQUIRED';
  approvalPolicyRef: string;
  reason: string;
}

/**
 * Convierte la decisión en el estado que se guarda. `requested` es lo que el cliente declaró (campo
 * de compatibilidad): no manda, pero una contradicción con el servidor se rechaza en lugar de
 * ignorarse en silencio, para que quien integra se entere de que su exención no existe.
 */
export function resolveApprovalForCreation(
  facts: ApprovalFacts,
  configuredPolicy: string | undefined,
  requested: string | undefined,
): ResolvedApproval {
  const decision = evaluateApprovalPolicy(facts, configuredPolicy);
  if (decision.outcome === 'UNAVAILABLE') {
    throw new ConflictException({
      code: 'ACCOUNTING_APPROVAL_POLICY_UNAVAILABLE',
      message:
        'No se puede crear el documento: la política de aprobación contable no está definida.',
      details: { reason: decision.reason },
    });
  }
  const approvalStatus = DECISION_TO_STATUS[decision.outcome];
  if (requested !== undefined && requested !== approvalStatus) {
    throw new UnprocessableEntityException({
      code: 'ACCOUNTING_DOCUMENT_APPROVAL_STATUS_CONTRADICTS_POLICY',
      message:
        'El estado de aprobación lo decide el servidor y no coincide con el solicitado. Omite el campo approvalStatus.',
      details: { requested, decidedByServer: approvalStatus },
    });
  }
  return { approvalStatus, approvalPolicyRef: decision.policyRef, reason: decision.reason };
}
