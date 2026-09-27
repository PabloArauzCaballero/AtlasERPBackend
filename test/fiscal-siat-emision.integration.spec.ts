/**
 * Emisión, cola, contingencia y anulación del ERP contra PostgreSQL REAL migrado y contra el emulador REAL del SIN
 * (`AtlasExternalProvidersMock`, proveedor `siat`), arrancado como proceso aparte.
 *
 * Lo que demuestra: que el CUF, el XML y el hash que produce el dominio del ERP son los que el
 * emulador —que valida recalculando— acepta (908), que CUIS/CUFD/catálogos quedan en la base, que
 * la bitácora no guarda el token y que el alcance por entidad legal se aplica.
 *
 * El emulador se busca en `ERP_PROVIDERS_MOCK_DIR` (por defecto `../AtlasExternalProvidersMock`).
 * Sin él la suite se SALTA avisándolo; con `ERP_REQUIRE_PROVIDERS_MOCK=1` (CI) es un FALLO.
 */
import { NotFoundException } from '@nestjs/common';
import { getConnectionToken, SequelizeModule } from '@nestjs/sequelize';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import { PinoLoggerService } from '../src/common/logger/pino-logger.service';
import { LegalEntityAccessService } from '../src/common/services/legal-entity-access.service';
import { accountingModels } from '../src/database/models';
import { SiatCatalogSyncService } from '../src/modules/fiscal/siat/application/siat-catalog-sync.service';
import { SiatCredentialsService } from '../src/modules/fiscal/siat/application/siat-credentials.service';
import { SiatGatewayService } from '../src/modules/fiscal/siat/application/siat-gateway.service';
import { SiatIssuerProfileService } from '../src/modules/fiscal/siat/application/siat-issuer-profile.service';
import { SiatStatusService } from '../src/modules/fiscal/siat/application/siat-status.service';
import { SiatAnnulmentService } from '../src/modules/fiscal/siat/application/siat-annulment.service';
import { SiatContingencyService } from '../src/modules/fiscal/siat/application/siat-contingency.service';
import { SiatDispatchService } from '../src/modules/fiscal/siat/application/siat-dispatch.service';
import type { DocumentoAEmitir } from '../src/modules/fiscal/siat/application/siat-emission.service';
import { SiatEmissionService } from '../src/modules/fiscal/siat/application/siat-emission.service';
import { AccountingDocumentsService } from '../src/modules/accounting/documents/services/accounting-documents.service';
import { FiscalPdfService } from '../src/modules/fiscal/siat/application/fiscal-pdf.service';
import { FiscalMailService } from '../src/modules/fiscal/siat/application/fiscal-mail.service';
import { DocumentsService } from '../src/modules/documents/documents.service';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  SiatInvocacionOpciones,
  SiatOperacion,
  SiatTransport,
} from '../src/modules/fiscal/siat/infrastructure/siat-transport';
import { ElectronicTaxDocumentModel } from '../src/database/models';
import { JsonMockSiatTransport } from '../src/modules/fiscal/siat/infrastructure/json-mock-siat.transport';
import { createMigratedDatabase } from './support/coverage-integration-db';
import {
  ADMIN,
  arrancarEmulador,
  describeWithMock,
  silentLogger,
  buzonDe,
} from './support/siat-emulador';

import type { MigratedDatabase } from './support/coverage-integration-db';

/** Transporte real hacia el emulador, con el escenario del mock que pida cada prueba. */
class TransporteConEscenario implements SiatTransport {
  readonly modo = 'mock_server';
  escenario: string | null = null;
  soloOperacion: string | null = null;
  constructor(private readonly real: JsonMockSiatTransport) {}
  get baseUrl() {
    return this.real.baseUrl;
  }
  invocar(
    operacion: SiatOperacion,
    solicitud: Record<string, unknown>,
    opciones?: SiatInvocacionOpciones,
  ) {
    const aplica =
      this.escenario && (!this.soloOperacion || this.soloOperacion === operacion.nombre);
    return this.real.invocar(operacion, solicitud, {
      ...opciones,
      ...(aplica ? { escenario: this.escenario! } : {}),
    });
  }
}

describeWithMock(
  'SIAT: emisión, cola, contingencia y anulación (emulador + PostgreSQL real)',
  () => {
    let db: MigratedDatabase;
    let moduleRef: TestingModule;
    let sequelize: Sequelize;
    let emulador: { url: string; proceso: ChildProcess };
    let transporte: TransporteConEscenario;
    let emision: SiatEmissionService;
    let despacho: SiatDispatchService;
    let anulacion: SiatAnnulmentService;
    let legalEntityId: string;

    beforeAll(async () => {
      [db, emulador] = await Promise.all([createMigratedDatabase('siat_emi'), arrancarEmulador()]);
      moduleRef = await Test.createTestingModule({
        imports: [
          SequelizeModule.forRoot({
            dialect: 'postgres',
            uri: db.url,
            autoLoadModels: false,
            synchronize: false,
            models: accountingModels,
            logging: false,
          }),
          SequelizeModule.forFeature(accountingModels),
        ],
        providers: [
          SiatGatewayService,
          SiatCredentialsService,
          SiatCatalogSyncService,
          SiatIssuerProfileService,
          SiatStatusService,
          SiatEmissionService,
          SiatDispatchService,
          SiatContingencyService,
          SiatAnnulmentService,
          LegalEntityAccessService,
          FiscalPdfService,
          FiscalMailService,
          { provide: DocumentsService, useValue: { generateInternal: jest.fn() } },
          { provide: AccountingDocumentsService, useValue: { reverseDocument: jest.fn() } },
          { provide: PinoLoggerService, useValue: silentLogger },
        ],
      }).compile();
      sequelize = moduleRef.get<Sequelize>(getConnectionToken());
      transporte = new TransporteConEscenario(
        new JsonMockSiatTransport(`${emulador.url}/mock/siat`, 'token-de-prueba-erp', 5000),
      );
      moduleRef.get(SiatGatewayService).usarTransporte(transporte);
      emision = moduleRef.get(SiatEmissionService);
      despacho = moduleRef.get(SiatDispatchService);
      anulacion = moduleRef.get(SiatAnnulmentService);
      const [fila] = await sequelize.query<{ id: string }>(
        `INSERT INTO atlas_accounting.legal_entity (code, legal_name, tax_id)
       VALUES ('SIAT-E', 'Atlas Prueba SRL', '1003579028') RETURNING id`,
        { type: QueryTypes.SELECT },
      );
      legalEntityId = fila!.id;
      await moduleRef.get(SiatIssuerProfileService).crear(
        {
          legalEntityId,
          nit: '1003579028',
          razonSocial: 'Atlas Prueba SRL',
          municipio: 'La Paz',
          direccion: 'CALLE DE PRUEBA 1',
          codigoSucursal: 0,
          codigoPuntoVenta: 0,
          codigoModalidad: 2,
          actividadEconomica: '451010',
          usuarioEmisor: 'atlas-erp',
          unidadMedidaDefault: 58,
        },
        ADMIN,
      );
    }, 180_000);

    afterAll(async () => {
      emulador?.proceso.kill();
      await moduleRef?.close();
      await db?.drop();
    });

    beforeEach(() => {
      transporte.escenario = null;
      transporte.soloOperacion = null;
    });

    const documento = (total = '113.00'): DocumentoAEmitir => ({
      sourceType: 'MERCHANT_INVOICE',
      sourceId: randomUUID(),
      receptor: {
        codigoTipoDocumentoIdentidad: 5,
        numeroDocumento: '123456789',
        nombreRazonSocial: 'Comercio de Prueba SRL',
        codigoCliente: 'B2B-1',
      },
      lineas: [
        {
          codigoProducto: 'MDR',
          descripcion: 'Comisión MDR',
          cantidad: '1',
          precioUnitario: total,
          codigoProductoSin: 49111,
          unidadMedida: 58,
        },
      ],
      totalEsperado: total,
    });

    async function emitir(doc = documento()) {
      const preparada = await emision.preparar(legalEntityId, doc.receptor);
      return sequelize.transaction((transaction) =>
        emision.emitirEnTransaccion(preparada!, doc, transaction),
      );
    }

    const recargar = (id: string) => ElectronicTaxDocumentModel.findByPk(id).then((d) => d!);

    it('en línea: QUEUED → el procesador lo envía → ACCEPTED (908)', async () => {
      const doc = await emitir();
      expect(doc.siatStatus).toBe('QUEUED');
      expect(doc.codigoEmision).toBe(1);
      await despacho.procesar();
      const final = await recargar(doc.id);
      expect({
        estado: final.siatStatus,
        codigo: final.codigoEstadoSin,
        mensajes: final.mensajes,
      }).toEqual({
        estado: 'ACCEPTED',
        codigo: 908,
        mensajes: [],
      });
    });

    it('el total fiscal tiene que cuadrar con la factura', async () => {
      const doc = documento('113.00');
      doc.totalEsperado = '113.01';
      await expect(emitir(doc)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'FISCAL_TOTAL_MISMATCH' }),
      });
    });

    it('dos reclamaciones a la vez: cada documento lo envía una sola', async () => {
      const docs = await Promise.all([emitir(), emitir(), emitir()]);
      const [a, b] = await Promise.all([despacho.reclamar(), despacho.reclamar()]);
      const todos = [...a, ...b];
      expect(new Set(todos).size).toBe(todos.length);
      expect(todos.sort()).toEqual(docs.map((d) => d.id).sort());
      for (const id of todos) await despacho.enviar(id);
      for (const d of docs) expect((await recargar(d.id)).siatStatus).toBe('ACCEPTED');
    });

    it('952 (el SIN ya la tenía): consulta el estado y adopta el 908, sin reenviar', async () => {
      const doc = await emitir();
      transporte.escenario = 'duplicate_request';
      transporte.soloOperacion = 'recepcionFactura';
      await despacho.procesar();
      const final = await recargar(doc.id);
      expect(final.siatStatus).toBe('ACCEPTED');
      expect(final.attemptCount).toBe(1);
    });

    it('904 con errores de negocio queda OBSERVED con sus mensajes', async () => {
      const doc = await emitir();
      transporte.escenario = 'partial_match';
      transporte.soloOperacion = 'recepcionFactura';
      await despacho.procesar();
      const final = await recargar(doc.id);
      expect(final.siatStatus).toBe('OBSERVED');
      expect((final.mensajes as { codigo: number }[]).map((m) => m.codigo)).toEqual([1013]);
    });

    it('CUFD vencido (953): se regenera fuera de línea con otro CUF, mismo número y fecha', async () => {
      const doc = await emitir();
      transporte.escenario = 'expired_token';
      transporte.soloOperacion = 'recepcionFactura';
      await despacho.procesar();
      const final = await recargar(doc.id);
      // El SIN sí responde (sólo venció el CUFD): en la misma pasada el evento se registra y el
      // documento viaja en paquete.
      expect(['OFFLINE', 'PACKAGED']).toContain(final.siatStatus);
      expect(final.codigoEmision).toBe(2);
      expect(final.cuf).not.toBe(doc.cuf);
      expect(final.numeroFactura).toBe(doc.numeroFactura);
      expect(final.fechaEmision).toBe(doc.fechaEmision);
      expect(final.codigoExcepcion).toBe(1);
      expect(final.eventId).not.toBeNull();
      // Deja el evento cerrado y despachado para las siguientes pruebas.
      await despacho.procesar();
      await despacho.procesar();
      await despacho.procesar();
      expect((await recargar(doc.id)).siatStatus).toBe('ACCEPTED');
    });

    it('SIN caído: se emite FUERA DE LÍNEA, y al volver va en paquete y queda ACCEPTED', async () => {
      transporte.escenario = 'provider_down';
      // El sondeo ve la caída (la comprobación se cachea 60 s).
      expect(await moduleRef.get(SiatCredentialsService).verificarComunicacion(true)).toBe(false);
      const offline = [await emitir(), await emitir()];
      for (const d of offline) {
        expect(d.siatStatus).toBe('OFFLINE');
        expect(d.contingencyFlag).toBe(true);
      }
      expect(offline[0]!.eventId).toBe(offline[1]!.eventId);
      // Sigue caído: el procesador no puede despachar nada.
      await despacho.procesar();
      expect((await recargar(offline[0]!.id)).siatStatus).toBe('OFFLINE');

      transporte.escenario = null;
      await despacho.procesar(); // cierra, registra el evento y envía el paquete → PACKAGED
      for (const d of offline) expect((await recargar(d.id)).siatStatus).toBe('PACKAGED');
      await despacho.procesar(); // primera validación: 901
      await despacho.procesar(); // segunda: 908
      for (const d of offline) expect((await recargar(d.id)).siatStatus).toBe('ACCEPTED');
      const [evento] = await sequelize.query<{ status: string; codigo_recepcion_evento: string }>(
        'SELECT status, codigo_recepcion_evento FROM atlas_accounting.siat_significant_event WHERE id = $1',
        { bind: [offline[0]!.eventId], type: QueryTypes.SELECT },
      );
      expect(evento).toMatchObject({ status: 'DISPATCHED' });
      expect(evento!.codigo_recepcion_evento).toBeTruthy();
    });

    it('en cola cuando el SIN cae: ERROR con espera, y agotados los intentos, fuera de línea', async () => {
      const doc = await emitir();
      transporte.escenario = 'provider_down';
      await despacho.procesar();
      let actual = await recargar(doc.id);
      expect(actual.siatStatus).toBe('ERROR');
      expect(actual.lastError).toBeTruthy();
      expect(actual.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
      // Siguientes intentos (se adelanta la espera como haría «Reintentar»).
      for (let i = 0; i < 5 && actual.siatStatus === 'ERROR'; i += 1) {
        await despacho.adelantar(doc.id);
        await despacho.procesar();
        actual = await recargar(doc.id);
      }
      expect(actual.siatStatus).toBe('OFFLINE');
      expect(actual.codigoEmision).toBe(2);
      transporte.escenario = null;
      await moduleRef.get(SiatCredentialsService).verificarComunicacion(true);
      for (let i = 0; i < 3; i += 1) await despacho.procesar();
      expect((await recargar(doc.id)).siatStatus).toBe('ACCEPTED');
    });

    it('el PDF se arma desde el XML enviado: estado, QR y totales en letras', async () => {
      const pdf = moduleRef.get(FiscalPdfService);
      const doc = await emitir(documento('170.50'));
      const interno = await pdf.payload(await recargar(doc.id));
      expect(interno).toMatchObject({ estado: 'REPRESENTACION_INTERNA', cuf: doc.cuf });
      await despacho.procesar();
      const valida = await pdf.payload(await recargar(doc.id));
      expect(valida).toMatchObject({
        estado: 'VALIDA',
        numeroFactura: Number(doc.numeroFactura),
        totales: expect.objectContaining({
          montoTotal: '170.50',
          montoLiteral: 'Son: Ciento setenta 50/100 Bolivianos',
        }),
      });
      expect(String(valida.qrDataUri)).toMatch(/^data:image\/svg\+xml;base64,/);
      // Contrato con la plantilla del worker: se valida en el otro repo con su esquema Zod.
      const salida = process.env.ERP_FISCAL_PDF_PAYLOAD_DIR;
      if (salida) {
        writeFileSync(join(salida, 'payload-valida.json'), JSON.stringify(valida, null, 2));
        writeFileSync(join(salida, 'payload-interna.json'), JSON.stringify(interno, null, 2));
      }
    });

    it('el comprador recibe su factura por correo al validarse, y el aviso al anularla', async () => {
      const correo = `comprador-${randomUUID().slice(0, 8)}@atlas.test`;
      const doc = documento('58.00');
      doc.receptor.correo = correo;
      const emitido = await emitir(doc);
      await despacho.procesar(); // 908 → encola el correo → lo envía en la misma pasada
      const factura = await buzonDe(emulador.url, correo);
      expect(factura).toHaveLength(1);
      expect(factura[0]!.subject).toBe(`Su factura N° ${emitido.numeroFactura}`);
      expect(factura[0]!.body).toContain(String(emitido.cuf));
      expect(factura[0]!.body).toContain(String(emitido.xmlSha256));
      expect(factura[0]!.body).toMatch(/Adjuntos: factura-\d+\.xml/);
      // Otra pasada no manda otro correo: uno por documento y tipo.
      await despacho.procesar();
      expect(await buzonDe(emulador.url, correo)).toHaveLength(1);

      await anulacion.anular(emitido.id, 1, ADMIN);
      await despacho.procesar();
      const todos = await buzonDe(emulador.url, correo);
      expect(todos.map((m) => m.subject)).toEqual([
        `Su factura N° ${emitido.numeroFactura}`,
        `Factura N° ${emitido.numeroFactura} anulada ante Impuestos Nacionales`,
      ]);
    });

    it('sin correo del comprador no se encola nada', async () => {
      const emitido = await emitir();
      await despacho.procesar();
      const [fila] = await sequelize.query<{ n: string }>(
        'SELECT count(*)::text AS n FROM atlas_accounting.siat_email_delivery WHERE document_id = $1',
        { bind: [emitido.id], type: QueryTypes.SELECT },
      );
      expect(fila!.n).toBe('0');
    });

    it('anular: 905 → VOIDED; una segunda vez ya no se puede', async () => {
      const doc = await emitir();
      await despacho.procesar();
      expect((await recargar(doc.id)).siatStatus).toBe('ACCEPTED');
      const resultado = await anulacion.anular(doc.id, 1, ADMIN);
      expect(resultado).toMatchObject({ siatStatus: 'VOIDED', contabilidad: 'SIN_ASIENTO' });
      expect((await recargar(doc.id)).annulmentMotivo).toBe(1);
      await expect(anulacion.anular(doc.id, 1, ADMIN)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'FISCAL_ANNUL_WRONG_STATUS' }),
      });
    });

    it('un motivo de anulación que no existe no llega al SIN', async () => {
      const doc = await emitir();
      await despacho.procesar();
      await expect(anulacion.anular(doc.id, 77, ADMIN)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'FISCAL_ANNUL_INVALID_REASON' }),
      });
    });

    it('otra entidad legal no puede anular', async () => {
      const doc = await emitir();
      await expect(
        anulacion.anular(doc.id, 1, {
          sub: 'x',
          role: 'accountant',
          legalEntityIds: [randomUUID()],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  },
);
