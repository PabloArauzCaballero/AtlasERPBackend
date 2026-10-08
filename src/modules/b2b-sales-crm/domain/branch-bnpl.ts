/**
 * Si una sucursal puede vender a crédito (BNPL): UNA sola regla para todas las puertas.
 *
 * Por qué existe: el 2026-10-08 ocho sucursales ACTIVE de un comercio quedaron para siempre en «Por
 * habilitar». `canOriginateBnpl` se escribía desde cinco sitios —alta en el CRM, alta en el portal, dos
 * «dar de alta/baja» y la activación del comercio— y cada uno decidía por su cuenta; ninguno miraba si el
 * comercio ya estaba aprobado, y la activación sólo alcanzaba a las sucursales en PENDING.
 *
 * La política (Pablo, 2026-10-08, «aprobado = todas vendan»):
 *
 *   puede vender  ⇔  la cuenta está aprobada (CUSTOMER)  ∧  la sucursal está ACTIVE  ∧  Atlas no la apagó.
 *
 * - El COMERCIO no puede concederse esto: el esquema del portal no admite `canOriginateBnpl`. Lo concede
 *   la aprobación del comercio por Atlas, que es lo que significa CUSTOMER.
 * - Atlas puede apagar UNA sucursal a mano (`bnplBlockedByAtlas`) y ninguna transición la reenciende.
 * - Una sucursal que no está ACTIVE nunca vende, diga lo que diga su marca.
 *
 * Esta función sólo decide; quien la usa es quien escribe `canOriginateBnpl`. Quien lee (originar una
 * venta) sigue leyendo la columna.
 */
import { AccountLifecycleStatus, BranchStatus } from '../b2b-sales-crm.enums';

export interface EstadoParaBnpl {
  /** `lifecycleStatus` de la cuenta B2B dueña de la sucursal. */
  lifecycleStatus: unknown;
  /** Estado que tendrá (o tiene) la sucursal. */
  branchStatus: unknown;
  /** Atlas la apagó a mano. */
  bnplBlockedByAtlas?: boolean | null;
}

export function sucursalPuedeVenderACredito(estado: EstadoParaBnpl): boolean {
  if (estado.bnplBlockedByAtlas) return false;
  if (String(estado.branchStatus) !== BranchStatus.ACTIVE) return false;
  return String(estado.lifecycleStatus) === AccountLifecycleStatus.CUSTOMER;
}
