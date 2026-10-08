import { AccountLifecycleStatus, BranchStatus } from '../b2b-sales-crm.enums';
import { sucursalPuedeVenderACredito } from './branch-bnpl';

/**
 * La tabla ENTERA: ciclo de vida de la cuenta × estado de la sucursal × «apagada por Atlas». Si alguien
 * añade un estado nuevo y no decide qué pasa con el crédito, esta prueba lo obliga a pensarlo.
 */
describe('sucursalPuedeVenderACredito', () => {
  const ciclos = Object.values(AccountLifecycleStatus);
  const estados = Object.values(BranchStatus);

  for (const ciclo of ciclos) {
    for (const estado of estados) {
      for (const bloqueada of [false, true]) {
        const esperado =
          ciclo === AccountLifecycleStatus.CUSTOMER && estado === BranchStatus.ACTIVE && !bloqueada;
        it(`cuenta ${ciclo} · sucursal ${estado} · apagada por Atlas=${bloqueada} → ${esperado ? 'VENDE' : 'no vende'}`, () => {
          expect(
            sucursalPuedeVenderACredito({
              lifecycleStatus: ciclo,
              branchStatus: estado,
              bnplBlockedByAtlas: bloqueada,
            }),
          ).toBe(esperado);
        });
      }
    }
  }

  it('sin la marca (null/undefined) se trata como no apagada', () => {
    const base = { lifecycleStatus: 'CUSTOMER', branchStatus: 'ACTIVE' };
    expect(sucursalPuedeVenderACredito({ ...base, bnplBlockedByAtlas: null })).toBe(true);
    expect(sucursalPuedeVenderACredito(base)).toBe(true);
  });

  it('valores desconocidos no venden: ante la duda, sin crédito', () => {
    expect(
      sucursalPuedeVenderACredito({ lifecycleStatus: undefined, branchStatus: 'ACTIVE' }),
    ).toBe(false);
    expect(sucursalPuedeVenderACredito({ lifecycleStatus: 'CUSTOMER', branchStatus: 'RARO' })).toBe(
      false,
    );
  });
});
