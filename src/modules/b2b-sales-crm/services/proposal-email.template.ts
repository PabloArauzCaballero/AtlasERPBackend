import type { B2BAccountModel, CommercialProposalModel } from '../models/b2b-sales-crm.models';
import { condicionesDePropuesta, fechaLegible } from './proposal-terms';

/** Quien envía: firma el correo y recibe las respuestas. */
export interface ProposalSender {
  fullName: string;
  email: string | null;
  roleLabel: string;
}

export interface ProposalEmail {
  subject: string;
  text: string;
  html: string;
  fromName: string;
  replyTo: string | null;
}

/**
 * Paleta de la marca pública (la landing, `assets/css/style.css`): azul profundo, teal y menta.
 * Los grises son los del papel del PDF, para que correo y documento se lean como una sola pieza.
 * Todos los textos sobre blanco pasan 4,5:1; el menta sólo va sobre el azul profundo.
 */
const C = {
  navy: '#0C2C50',
  teal: '#0E7377',
  mint: '#2BE0A8',
  mintSoft: '#E8FBF5',
  ink: '#111827',
  text: '#374151',
  muted: '#6B7280',
  line: '#E5E7EB',
  canvas: '#F3F5F7',
  white: '#FFFFFF',
};

const FONT = "'Manrope','Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const DISPLAY = "'Sora','Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Todo lo que viene de la base o del comercial se escapa: un nombre con `<` no puede romper el correo. */
function esc(valor: string | number | null | undefined): string {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0] ?? nombre;

/** Párrafos del mensaje del comercial: respeta sus saltos de línea sin permitir HTML. */
function parrafos(texto: string, estilo: string): string {
  return texto
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="${estilo}">${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * El correo con el que la propuesta llega al comercio.
 *
 * Hasta el 2026-09-30 era un bloque de texto plano firmado «Equipo comercial de ATLAS»: se leía como
 * un aviso automático, no como alguien que escribe a un cliente. Ahora:
 * - habla una persona (quien envía), saluda por su nombre al contacto y firma con su nombre y cargo;
 * - las respuestas le llegan a ELLA (`replyTo`), no a un buzón genérico;
 * - el resumen va en una tarjeta legible, con las condiciones en tabla;
 * - el HTML es de tablas y estilos en línea: es lo único que Gmail y Outlook pintan igual.
 *
 * El ingreso mensual estimado NO aparece: es una cifra interna de ATLAS, no algo que el comercio
 * paga ni recibe.
 */
export function correoDePropuesta(input: {
  proposal: CommercialProposalModel;
  account: B2BAccountModel | null;
  contactName: string | null;
  message: string | null;
  sender: ProposalSender;
  pdfAttached: boolean;
}): ProposalEmail {
  const { proposal, account, sender } = input;
  const comercio = account?.tradeName || account?.legalName || 'su comercio';
  const saludo = input.contactName
    ? `Hola, ${primerNombre(input.contactName)}:`
    : `Hola, equipo de ${comercio}:`;
  const vigencia = fechaLegible(proposal.validUntil);
  const condiciones = condicionesDePropuesta(proposal);
  const firmante = primerNombre(sender.fullName);
  const asunto = `Propuesta para ${comercio}: ventas en cuotas con ATLAS`;
  const intro =
    `Gracias por el tiempo que nos dedicaron. Les comparto la propuesta para que ${comercio} ` +
    'ofrezca a sus clientes la opción de comprar en cuotas con ATLAS.';
  const cierre =
    'Si les parece bien, respondan a este correo y preparamos el contrato con estas mismas condiciones. ' +
    'Si prefieren revisarla juntos, con gusto coordinamos una llamada.';

  const text = [
    saludo,
    '',
    intro,
    ...(input.message?.trim() ? ['', input.message.trim()] : []),
    '',
    `Propuesta ${proposal.proposalNumber} · válida hasta el ${vigencia}`,
    ...condiciones.map((c) => `  • ${c.concepto}: ${c.condicion} (${c.cobro.toLowerCase()})`),
    ...(input.pdfAttached ? ['', 'La propuesta completa va adjunta en PDF.'] : []),
    '',
    cierre,
    '',
    'Un saludo,',
    sender.fullName,
    `${sender.roleLabel} · ATLAS`,
    ...(sender.email ? [sender.email] : []),
  ].join('\n');

  const p = `margin:0 0 16px 0;font-family:${FONT};font-size:15px;line-height:24px;color:${C.text};`;
  const filasCondiciones = condiciones.length
    ? condiciones
        .map(
          (c, i) => `
          <tr>
            <td style="padding:12px 0;${i ? `border-top:1px solid ${C.line};` : ''}font-family:${FONT};font-size:14px;line-height:20px;color:${C.ink};">
              <strong style="font-weight:700;">${esc(c.concepto)}</strong>
              ${c.detalle ? `<br><span style="color:${C.muted};font-size:13px;">${esc(c.detalle)}</span>` : ''}
            </td>
            <td align="right" style="padding:12px 0 12px 16px;${i ? `border-top:1px solid ${C.line};` : ''}font-family:${FONT};font-size:14px;line-height:20px;color:${C.ink};width:42%;">
              <strong style="font-weight:700;">${esc(c.condicion)}</strong>
              <br><span style="color:${C.muted};font-size:13px;">${esc(c.cobro)}</span>
            </td>
          </tr>`,
        )
        .join('')
    : `<tr><td style="padding:12px 0;font-family:${FONT};font-size:14px;color:${C.muted};">Las condiciones se detallan en el documento adjunto.</td></tr>`;

  const nota = input.message?.trim()
    ? `
      <tr><td class="px" style="padding:0 40px 8px 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td style="border-left:3px solid ${C.teal};background:${C.mintSoft};padding:16px 20px;border-radius:0 8px 8px 0;">
            ${parrafos(input.message, `margin:0 0 8px 0;font-family:${FONT};font-size:15px;line-height:24px;color:${C.ink};`)}
          </td></tr>
        </table>
      </td></tr>`
    : '';

  const responder = sender.email
    ? `mailto:${encodeURIComponent(sender.email)}?subject=${encodeURIComponent(`Re: ${asunto}`)}`
    : null;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<style>
  @media only screen and (max-width: 480px) {
    .px { padding-left: 22px !important; padding-right: 22px !important; }
    .card { padding-left: 16px !important; padding-right: 16px !important; }
    .h1 { font-size: 22px !important; line-height: 28px !important; }
  }
</style>
<title>${esc(asunto)}</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&family=Sora:wght@700;800&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${C.canvas};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.canvas};">${esc(
    `Propuesta ${proposal.proposalNumber} para ${comercio}, válida hasta el ${vigencia}.`,
  )}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.canvas};">
  <tr><td align="center" style="padding:32px 12px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:${C.white};border-radius:16px;overflow:hidden;border:1px solid ${C.line};">

      <tr><td class="px" style="background:${C.navy};padding:28px 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="font-family:${DISPLAY};font-size:24px;line-height:28px;font-weight:800;letter-spacing:2px;color:${C.white};">ATLAS</td>
          <td align="right" style="font-family:${FONT};font-size:12px;line-height:16px;color:${C.mint};">Compras en cuotas<br>para su comercio</td>
        </tr></table>
      </td></tr>
      <tr><td style="height:4px;line-height:4px;font-size:4px;background:${C.teal};">&nbsp;</td></tr>

      <tr><td class="px" style="padding:36px 40px 8px 40px;">
        <p style="margin:0 0 6px 0;font-family:${FONT};font-size:12px;line-height:16px;letter-spacing:1px;text-transform:uppercase;color:${C.teal};font-weight:700;">Propuesta comercial</p>
        <h1 class="h1" style="margin:0 0 24px 0;font-family:${DISPLAY};font-size:26px;line-height:32px;font-weight:800;color:${C.navy};">${esc(comercio)}</h1>
        <p style="${p}">${esc(saludo)}</p>
        <p style="${p}">${esc(intro)}</p>
      </td></tr>
      ${nota}

      <tr><td class="px" style="padding:16px 40px 8px 40px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${C.line};border-radius:12px;">
          <tr><td class="card" style="padding:20px 24px 4px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
              <td style="font-family:${FONT};font-size:12px;line-height:16px;color:${C.muted};">Propuesta<br><strong style="font-size:15px;line-height:22px;color:${C.ink};white-space:nowrap;">${esc(proposal.proposalNumber)}</strong></td>
              <td align="right" style="font-family:${FONT};font-size:12px;line-height:16px;color:${C.muted};">Válida hasta<br><strong style="font-size:15px;line-height:22px;color:${C.ink};">${esc(vigencia)}</strong></td>
            </tr></table>
          </td></tr>
          <tr><td class="card" style="padding:8px 24px 12px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${C.line};">
              ${filasCondiciones}
            </table>
          </td></tr>
        </table>
      </td></tr>

      <tr><td class="px" style="padding:24px 40px 8px 40px;">
        ${input.pdfAttached ? `<p style="${p}">La propuesta completa va adjunta en PDF, con el detalle de cada condición y cómo funciona el servicio.</p>` : ''}
        <p style="${p}">${esc(cierre)}</p>
      </td></tr>

      ${
        responder
          ? `<tr><td class="px" style="padding:0 40px 28px 40px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="border-radius:10px;background:${C.teal};">
            <a href="${esc(responder)}" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:700;color:${C.white};text-decoration:none;border-radius:10px;">Responder a ${esc(firmante)}</a>
          </td>
        </tr></table>
      </td></tr>`
          : ''
      }

      <tr><td class="px" style="padding:0 40px 36px 40px;">
        <p style="margin:0 0 16px 0;font-family:${FONT};font-size:15px;line-height:24px;color:${C.text};">Un saludo,</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="border-left:3px solid ${C.mint};padding:2px 0 2px 14px;">
            <p style="margin:0;font-family:${DISPLAY};font-size:16px;line-height:22px;font-weight:700;color:${C.navy};">${esc(sender.fullName)}</p>
            <p style="margin:2px 0 0 0;font-family:${FONT};font-size:13px;line-height:20px;color:${C.muted};">${esc(sender.roleLabel)} · ATLAS</p>
            ${sender.email ? `<p style="margin:2px 0 0 0;font-family:${FONT};font-size:13px;line-height:20px;"><a href="mailto:${esc(sender.email)}" style="color:${C.teal};text-decoration:none;">${esc(sender.email)}</a></p>` : ''}
          </td>
        </tr></table>
      </td></tr>

      <tr><td class="px" style="background:${C.canvas};padding:20px 40px;border-top:1px solid ${C.line};">
        <p style="margin:0;font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};">Esta propuesta está dirigida a ${esc(comercio)} y es válida hasta el ${esc(vigencia)}. Si la recibió por error, avísenos respondiendo a este correo.</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

  return {
    subject: asunto,
    text,
    html,
    fromName: `${sender.fullName} · ATLAS`,
    replyTo: sender.email,
  };
}
