import { ContractsService } from '../src/modules/accounting/contracts/services/contracts.service';

/**
 * El contador de un listado filtrado por acceso cuenta lo que se DEVUELVE.
 *
 * `list` oculta los contratos de entidades legales que el usuario no puede ver, pero devolvía
 * `total: rows.length` —el listado sin filtrar—, así que la fila se ocultaba y su existencia no:
 * el número decía cuántos contratos hay en entidades ajenas. Facturas, recibos y documentos
 * contables ya contaban bien; éste era el único de los cuatro que se había separado, y un contador
 * que no cuadra con su lista tampoco deja paginar.
 */
describe('ContractsService.list — el total cuenta lo visible', () => {
  const contrato = (id: string, legalEntityId: string) => ({ id, legalEntityId });

  function montar(visibles: string[]) {
    const rows = [contrato('c1', 'LE-1'), contrato('c2', 'LE-2'), contrato('c3', 'LE-3')];
    const service = new ContractsService(
      {} as never,
      {} as never,
      {
        assertCanAccessLegalEntity: (_user: unknown, legalEntityId: string) => {
          if (!visibles.includes(legalEntityId)) throw new Error('FORBIDDEN_LEGAL_ENTITY');
        },
      } as never,
      {} as never,
      { findAll: () => Promise.resolve(rows) } as never,
      {} as never,
    );
    return service;
  }

  it('no revela cuántos contratos hay en entidades que el usuario no puede ver', async () => {
    const service = montar(['LE-1']);

    const result = await service.list({} as never);

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1); // antes: 3
  });

  it('con acceso a todo, total e items coinciden igual', async () => {
    const service = montar(['LE-1', 'LE-2', 'LE-3']);

    const result = await service.list({} as never);

    expect(result.items).toHaveLength(3);
    expect(result.total).toBe(3);
  });

  it('sin acceso a ninguna, el total es cero y no tres', async () => {
    const service = montar([]);

    const result = await service.list({} as never);

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});
