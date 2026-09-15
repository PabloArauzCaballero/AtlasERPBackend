import { blankFormPayloadSchema } from './blank-form.schema';
import { generateDocumentSchema } from './documents.schemas';
import {
  PUBLIC_PAPER_FORMS,
  findPublicPaperForm,
  formVersionOf,
  publicPaperFormPayload,
} from './forms/public-forms.registry';

const informe = {
  title: 'Cartera',
  sections: [{ title: 'Resumen', fields: [{ label: 'Total', value: 3 }] }],
};
const formulario = {
  formCode: 'ERP-CRM-CUENTA-CREAR',
  formVersion: '1',
  title: 'Alta de cuenta',
  sections: [{ title: 'Datos', fields: [{ label: 'Razón social', kind: 'text', required: true }] }],
};

describe('generateDocumentSchema · una forma por plantilla', () => {
  it('sin templateId sigue siendo el informe genérico (nada de lo que ya imprime cambia)', () => {
    const r = generateDocumentSchema.safeParse({ payload: informe });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.templateId).toBeUndefined();
  });

  it('blank-form exige el payload de formulario, no el de informe', () => {
    expect(
      generateDocumentSchema.safeParse({ templateId: 'blank-form', payload: formulario }).success,
    ).toBe(true);
    expect(
      generateDocumentSchema.safeParse({ templateId: 'blank-form', payload: informe }).success,
    ).toBe(false);
    expect(
      generateDocumentSchema.safeParse({ templateId: 'generic-result-report', payload: formulario })
        .success,
    ).toBe(false);
  });

  it('una plantilla que el ERP no publica se rechaza aquí, no en el worker', () => {
    expect(
      generateDocumentSchema.safeParse({ templateId: 'credit-analysis-report', payload: informe })
        .success,
    ).toBe(false);
  });
});

describe('blankFormPayloadSchema', () => {
  it('rechaza el anexo huérfano, la sección vacía y el exceso de renglones', () => {
    expect(
      blankFormPayloadSchema.safeParse({
        ...formulario,
        sections: [
          { title: 'D', fields: [{ label: 'Rubro', kind: 'select', catalogRef: 'Rubros' }] },
        ],
      }).success,
    ).toBe(false);
    expect(
      blankFormPayloadSchema.safeParse({ ...formulario, sections: [{ title: 'Nada' }] }).success,
    ).toBe(false);
    const tablas = Array.from({ length: 4 }, (_, i) => ({
      title: `T${i}`,
      table: { columns: [{ label: 'A' }], rows: 60 },
    }));
    expect(blankFormPayloadSchema.safeParse({ ...formulario, sections: tablas }).success).toBe(
      false,
    );
  });
});

describe('formularios públicos en papel', () => {
  it('todos cumplen el contrato del formulario en blanco', () => {
    for (const form of PUBLIC_PAPER_FORMS) {
      const r = blankFormPayloadSchema.safeParse(publicPaperFormPayload(form));
      expect(r.success).toBe(true);
    }
  });

  it('la versión es una huella de la estructura: cambia si cambia un campo, no si cambia una frase', () => {
    const form = findPublicPaperForm('erp-portal-expediente-abrir');
    expect(form).toBeDefined();
    const cuerpo = form!.build();
    const version = formVersionOf(cuerpo);
    expect(version).toMatch(/^[0-9a-f]{8}$/);
    expect(formVersionOf({ ...cuerpo, instructions: ['otra frase'] })).toBe(version);
    const [primera, ...resto] = cuerpo.sections;
    const conCampo = {
      ...cuerpo,
      sections: [
        {
          ...primera,
          title: primera?.title ?? 'Datos',
          fields: [...(primera?.fields ?? []), { label: 'Extra', kind: 'text' as const }],
        },
        ...resto,
      ],
    };
    expect(formVersionOf(conCampo)).not.toBe(version);
  });

  it('lo que no está publicado no se encuentra', () => {
    expect(findPublicPaperForm('ERP-CRM-CUENTA-CREAR')).toBeUndefined();
  });
});
