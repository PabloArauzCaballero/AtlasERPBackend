import { createHash } from 'node:crypto';
import type { BlankFormPayload } from '../blank-form.schema';

/**
 * Formularios en papel que se pueden imprimir SIN sesión.
 *
 * Son pocos a propósito: sólo lo que alguien necesita rellenar ANTES de tener cuenta —la
 * solicitud de afiliación de un comercio—. El resto del catálogo de formularios lo arma cada
 * pantalla del ERP a partir de su propia definición y sale por la ruta autenticada; publicarlo
 * aquí sería enseñar la estructura interna de la operación a quien no tiene por qué verla.
 *
 * `formVersion` NO se escribe a mano: es una huella de los campos. Si alguien añade un campo y
 * olvida la versión, la versión cambia sola, y quien transcribe un papel viejo lo sabe.
 */
export interface PublicPaperForm {
  formCode: string;
  title: string;
  build: () => Omit<BlankFormPayload, 'formCode' | 'formVersion'>;
}

/** Huella corta y estable de la estructura (etiqueta, tipo, obligatoriedad, nº de opciones). */
export function formVersionOf(payload: Omit<BlankFormPayload, 'formCode' | 'formVersion'>): string {
  const estructura = payload.sections.map((section) => ({
    t: section.title,
    f: (section.fields ?? []).map((f) => [
      f.label,
      f.kind,
      f.required ?? false,
      f.options?.length ?? 0,
    ]),
    r: section.table ? [section.table.columns.map((c) => c.label), section.table.rows] : null,
  }));
  return createHash('sha256').update(JSON.stringify(estructura)).digest('hex').slice(0, 8);
}

const RUBROS = [
  ['RETAIL', 'Retail / Comercio'],
  ['SERVICIOS', 'Servicios profesionales'],
  ['EDUCACION', 'Educación'],
  ['SALUD', 'Salud y farmacia'],
  ['ALIMENTOS', 'Alimentos y bebidas'],
  ['TECNOLOGIA', 'Tecnología y electrónica'],
  ['HOGAR', 'Hogar y muebles'],
  ['VESTIMENTA', 'Vestimenta y calzado'],
  ['AUTOMOTOR', 'Automotor y repuestos'],
  ['CONSTRUCCION', 'Construcción y ferretería'],
  ['TURISMO', 'Turismo y transporte'],
  ['OTRO', 'Otro'],
] as const;

/** Espejo de «Abrir expediente» (`PartnerDossierScreen`, portal del comercio). */
const solicitudAfiliacion: PublicPaperForm = {
  formCode: 'ERP-PORTAL-EXPEDIENTE-ABRIR',
  title: 'Solicitud de afiliación de comercio',
  build: () => ({
    title: 'Solicitud de afiliación de comercio',
    subtitle: 'Portal del comercio · Abrir expediente',
    instructions: [
      'Rellene los campos marcados con asterisco, en mayúsculas y con letra clara.',
      'Marque UN solo rubro. Si ninguno corresponde, marque «Otro».',
      'Entregue este formulario en la oficina comercial de ATLAS o a su ejecutivo. Le crearán el expediente y le enviarán las credenciales del portal al correo indicado.',
    ],
    sections: [
      {
        title: 'Datos del comercio',
        fields: [
          { label: 'Razón social', kind: 'text', required: true, width: 2 },
          { label: 'NIT', kind: 'number', required: true, hint: 'Sólo dígitos' },
          { label: 'Nombre comercial', kind: 'text', width: 2 },
          { label: 'Matrícula de comercio', kind: 'text' },
          {
            label: 'Rubro del negocio',
            kind: 'select',
            width: 3,
            options: RUBROS.map(([code, label]) => ({ code, label })),
          },
        ],
      },
      {
        title: 'Contacto',
        fields: [
          {
            label: 'Correo de contacto',
            kind: 'email',
            required: true,
            width: 2,
            hint: 'Ahí llegarán las credenciales del portal',
          },
          { label: 'Teléfono', kind: 'phone' },
        ],
      },
    ],
    declarations: [
      'Declaro que los datos consignados son verdaderos y autorizo a ATLAS a verificarlos ante las entidades que corresponda.',
      'Este formulario será transcrito al sistema por personal autorizado; el número de serie impreso al pie identifica esta solicitud.',
    ],
    signatures: [
      { name: 'Firma del solicitante', role: 'Representante del comercio' },
      { name: 'Recibido por', role: 'Personal de ATLAS' },
    ],
  }),
};

export const PUBLIC_PAPER_FORMS: readonly PublicPaperForm[] = [solicitudAfiliacion];

export function findPublicPaperForm(formCode: string): PublicPaperForm | undefined {
  return PUBLIC_PAPER_FORMS.find((form) => form.formCode === formCode.toUpperCase());
}

export function publicPaperFormPayload(form: PublicPaperForm): BlankFormPayload {
  const cuerpo = form.build();
  return { formCode: form.formCode, formVersion: formVersionOf(cuerpo), ...cuerpo };
}
