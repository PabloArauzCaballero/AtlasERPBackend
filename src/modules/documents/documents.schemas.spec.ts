import { generateDocumentSchema } from './documents.schemas';

const informe = {
  title: 'Cartera',
  sections: [{ title: 'Resumen', fields: [{ label: 'Total', value: 3 }] }],
};

/**
 * Este archivo probaba además `blank-form`, la plantilla de los formularios en papel. Esa función
 * se retiró entera el 2026-09-18 y con ella su esquema; lo que sigue importando —y por eso queda—
 * es que el `templateId` sea una lista CERRADA: abierto, cualquier pantalla podría pedirle al
 * worker una plantilla de otro producto.
 */
describe('generateDocumentSchema · sólo las plantillas que el ERP publica', () => {
  it('sin templateId sigue siendo el informe genérico (nada de lo que ya imprime cambia)', () => {
    const r = generateDocumentSchema.safeParse({ payload: informe });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.templateId).toBeUndefined();
  });

  it('el informe genérico se puede pedir por su nombre', () => {
    expect(
      generateDocumentSchema.safeParse({ templateId: 'generic-result-report', payload: informe })
        .success,
    ).toBe(true);
  });

  it('la plantilla retirada ya no se admite', () => {
    const formulario = {
      formCode: 'ERP-CRM-CUENTA-CREAR',
      formVersion: '1',
      title: 'Alta de cuenta',
      sections: [{ title: 'Datos', fields: [{ label: 'Razón social', kind: 'text' }] }],
    };
    expect(
      generateDocumentSchema.safeParse({ templateId: 'blank-form', payload: formulario }).success,
    ).toBe(false);
  });

  it('una plantilla que el ERP no publica se rechaza aquí, no en el worker', () => {
    expect(
      generateDocumentSchema.safeParse({ templateId: 'credit-analysis-report', payload: informe })
        .success,
    ).toBe(false);
  });
});
