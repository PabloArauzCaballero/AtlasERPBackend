import { FiscalDocumentsController } from '../src/modules/fiscal/siat/controllers/fiscal-documents.controller';
import type { AuthUser } from '../src/common/types/auth-context.types';

/**
 * Cubre el hallazgo UNTESTED_WRITE: `POST accounting/fiscal/documents/:id/annul` no tenía ningún
 * test que lo nombrara por su ruta HTTP. Es una orden explícita del operador hacia el SIN (ver
 * cabecera del controlador: «ninguna ruta llama al SIN desde la petición salvo la anulación»), así
 * que se fija que el `id` de la ruta y el `codigoMotivo` validado lleguen intactos al servicio de
 * anulación, con el usuario autenticado. La protección de rol (`admin`, `accountant`, a nivel de
 * clase) está en `test/untested-writes-roles-guard.spec.ts`.
 */
describe('FiscalDocumentsController.annul: POST accounting/fiscal/documents/:id/annul', () => {
  function build() {
    const documents = {};
    const dispatch = {};
    const annulment = { anular: jest.fn() };
    const contingency = {};
    const fiscalPdf = {};
    const controller = new FiscalDocumentsController(
      documents as never,
      dispatch as never,
      annulment as never,
      contingency as never,
      fiscalPdf as never,
    );
    const user: AuthUser = { sub: 'user-1', roles: ['admin'] };
    return { controller, annulment, user };
  }

  it('anula el documento de la ruta con el motivo del cuerpo y el usuario autenticado', async () => {
    const { controller, annulment, user } = build();
    annulment.anular.mockResolvedValue({ id: 'doc-1', estado: 'ANULADO' });

    const respuesta = await controller.annul('doc-1', { codigoMotivo: 2 }, user);

    expect(annulment.anular).toHaveBeenCalledWith('doc-1', 2, user);
    expect(respuesta).toEqual({ id: 'doc-1', estado: 'ANULADO' });
  });

  it('propaga el error del servicio de anulación (p. ej. documento ya anulado)', async () => {
    const { controller, annulment, user } = build();
    const error = new Error('SIAT_DOCUMENT_ALREADY_ANNULLED');
    annulment.anular.mockRejectedValue(error);

    await expect(controller.annul('doc-1', { codigoMotivo: 2 }, user)).rejects.toThrow(error);
  });
});
