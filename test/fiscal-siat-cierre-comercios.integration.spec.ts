/**
 * Cierre de facturación de comercios (F6) de punta a punta contra PostgreSQL REAL y el emulador
 * REAL del SIN: cargos del mes cerrado → corrida idempotente → factura de comercio con su
 * documento fiscal → cola → ACCEPTED. Sin emulador se SALTA avisándolo (ver la otra suite SIAT).
 */
import { getConnectionToken, SequelizeModule } from '@nestjs/sequelize';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { QueryTypes } from 'sequelize';
import type { Sequelize } from 'sequelize-typescript';
import { PinoLoggerService } from '../src/common/logger/pino-logger.service';
import { LegalEntityAccessService } from '../src/common/services/legal-entity-access.service';
import { accountingModels, ElectronicTaxDocumentModel } from '../src/database/models';
import { atlasSalesModels } from '../src/modules/b2b-sales-crm/models/b2b-sales-crm.models';
import { B2BSalesCrmRepository } from '../src/modules/b2b-sales-crm/repositories/b2b-sales-crm.repository';
import { B2BBnplBillingService } from '../src/modules/b2b-sales-crm/services/b2b-bnpl-billing.service';
import { MerchantBillingCycleService } from '../src/modules/b2b-sales-crm/billing-cycle/merchant-billing-cycle.service';
import { SiatCatalogSyncService } from '../src/modules/fiscal/siat/application/siat-catalog-sync.service';
import { SiatContingencyService } from '../src/modules/fiscal/siat/application/siat-contingency.service';
import { SiatCredentialsService } from '../src/modules/fiscal/siat/application/siat-credentials.service';
import { SiatDispatchService } from '../src/modules/fiscal/siat/application/siat-dispatch.service';
import { SiatEmissionService } from '../src/modules/fiscal/siat/application/siat-emission.service';
import { SiatGatewayService } from '../src/modules/fiscal/siat/application/siat-gateway.service';
import { SiatIssuerProfileService } from '../src/modules/fiscal/siat/application/siat-issuer-profile.service';
import { FiscalMailService } from '../src/modules/fiscal/siat/application/fiscal-mail.service';
import { FiscalPdfService } from '../src/modules/fiscal/siat/application/fiscal-pdf.service';
import { DocumentsService } from '../src/modules/documents/documents.service';
import { JsonMockSiatTransport } from '../src/modules/fiscal/siat/infrastructure/json-mock-siat.transport';
import { createMigratedDatabase } from './support/coverage-integration-db';
import { arrancarEmulador, describeWithMock, silentLogger } from './support/siat-emulador';
import type { ChildProcess } from 'node:child_process';

import type { MigratedDatabase } from './support/coverage-integration-db';

describeWithMock(
  'F6: cierre de facturación de comercios con documento fiscal (emulador + PostgreSQL real)',
  () => {
    let db: MigratedDatabase;
    let moduleRef: TestingModule;
    let sequelize: Sequelize;
    let emulador: { url: string; proceso: ChildProcess };
    let cierre: MerchantBillingCycleService;
    let despacho: SiatDispatchService;
    let conNit: string;
    let sinNit: string;

    const q = <T extends object>(sql: string, bind: unknown[] = []) =>
      sequelize.query<T>(sql, { bind, type: QueryTypes.SELECT });

    beforeAll(async () => {
      [db, emulador] = await Promise.all([createMigratedDatabase('siat_f6'), arrancarEmulador()]);
      const modelos = [...atlasSalesModels, ...accountingModels];
      moduleRef = await Test.createTestingModule({
        imports: [
          SequelizeModule.forRoot({
            dialect: 'postgres',
            uri: db.url,
            dialectOptions: { options: '-c search_path=atlas_sales,atlas_accounting,public' },
            autoLoadModels: false,
            synchronize: false,
            models: modelos,
            logging: false,
          }),
          SequelizeModule.forFeature(modelos),
        ],
        providers: [
          B2BSalesCrmRepository,
          B2BBnplBillingService,
          MerchantBillingCycleService,
          SiatGatewayService,
          SiatCredentialsService,
          SiatCatalogSyncService,
          SiatIssuerProfileService,
          SiatContingencyService,
          SiatEmissionService,
          SiatDispatchService,
          FiscalMailService,
          FiscalPdfService,
          { provide: DocumentsService, useValue: { generateInternal: jest.fn() } },
          LegalEntityAccessService,
          { provide: PinoLoggerService, useValue: silentLogger },
        ],
      }).compile();
      sequelize = moduleRef.get<Sequelize>(getConnectionToken());
      moduleRef
        .get(SiatGatewayService)
        .usarTransporte(
          new JsonMockSiatTransport(`${emulador.url}/mock/siat`, 'token-de-prueba-erp', 5000),
        );
      cierre = moduleRef.get(MerchantBillingCycleService);
      despacho = moduleRef.get(SiatDispatchService);

      const [entidad] = await q<{ id: string }>(
        `INSERT INTO atlas_accounting.legal_entity (code, legal_name, tax_id)
       VALUES ('SIAT-F6', 'Atlas Prueba SRL', '1003579028') RETURNING id`,
      );
      await moduleRef.get(SiatIssuerProfileService).crear(
        {
          legalEntityId: entidad!.id,
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
        { sub: 'x', role: 'admin', roles: ['admin'] },
      );
      await q(
        `INSERT INTO atlas_sales.billing_products (code, name, charge_basis, source_type, unit_label, sin_product_code, sin_unit_code)
       VALUES ('MDR', 'Comisión por venta a plazos', 'MDR', 'MDR', 'venta', 49111, 58) RETURNING id`,
      );
      const cuenta = async (nombre: string, nit: string | null) =>
        (
          await q<{ id: string }>(
            `INSERT INTO atlas_sales.b2b_accounts (legal_name, trade_name, tax_id, tax_document_type, lifecycle_status, category, business_line)
           VALUES ($1, $1, $2, 5, 'CUSTOMER', 'PRUEBA', 'PRUEBA') RETURNING id`,
            [nombre, nit],
          )
        )[0]!.id;
      conNit = await cuenta('Comercio con NIT', '123456789');
      sinNit = await cuenta('Comercio sin NIT', null);
      const cargo = (cuentaId: string, monto: string, cuando: string) =>
        q(
          `INSERT INTO atlas_sales.merchant_receivables (account_id, source_type, amount_original, amount_open, due_date, issued_at)
         VALUES ($1, 'MDR', $2, $2, current_date + 30, $3::timestamptz) RETURNING id`,
          [cuentaId, monto, cuando],
        );
      await cargo(conNit, '100.00', '2026-09-10T15:00:00Z');
      await cargo(conNit, '50.00', '2026-09-20T15:00:00Z');
      await cargo(sinNit, '80.00', '2026-09-15T15:00:00Z');
      // Del mes nuevo: no entra en el cierre de septiembre.
      await cargo(conNit, '999.00', '2026-10-01T12:00:00Z');
    }, 180_000);

    afterAll(async () => {
      emulador?.proceso.kill();
      await moduleRef?.close();
      await db?.drop();
    });

    // 1 de octubre de 2026, 00:30 en La Paz (04:30 UTC).
    const ahora = new Date('2026-10-01T04:30:00Z');

    it('factura el mes cerrado: una factura por comercio facturable, el que no tiene NIT queda como error', async () => {
      // El SIN exige que la fecha de la factura sea la de emisión: el cierre usa «hoy». Aquí «hoy» es
      // el 1 de octubre simulado sólo para elegir el ciclo; la emisión fiscal usa el reloj real, así
      // que esta prueba corre con la fecha de hoy como fecha de factura.
      const resultado = await cierre.ejecutar({ trigger: 'MANUAL', ahora: new Date() });
      expect(resultado.status).toBe('PARTIAL');
      expect(resultado.invoicesCreated).toBe(1);
      expect(resultado.errors).toEqual([
        expect.objectContaining({ accountId: sinNit, code: 'FISCAL_RECEIVER_INCOMPLETE' }),
      ]);
      const [factura] = await q<{
        id: string;
        total_amount: string;
        legal_entity_id: string | null;
      }>(
        'SELECT id, total_amount, legal_entity_id FROM atlas_sales.merchant_invoices WHERE account_id = $1',
        [conNit],
      );
      expect(factura!.legal_entity_id).not.toBeNull();
      // El cargo del mes nuevo sigue sin facturar.
      const pendientes = await q<{ amount_open: string }>(
        'SELECT amount_open FROM atlas_sales.merchant_receivables WHERE account_id = $1 AND invoice_id IS NULL',
        [conNit],
      );
      expect(pendientes.map((p) => p.amount_open)).toEqual(['999.00']);

      const documento = await ElectronicTaxDocumentModel.findOne({
        where: { sourceId: factura!.id },
      });
      expect(documento).toMatchObject({ siatStatus: 'QUEUED', sourceType: 'MERCHANT_INVOICE' });
      expect(documento!.montoTotal).toBe(factura!.total_amount);
      await despacho.procesar();
      await documento!.reload();
      expect(documento!.siatStatus).toBe('ACCEPTED');
    });

    it('la misma corrida no factura dos veces el ciclo', async () => {
      const otra = await cierre.ejecutar({ trigger: 'MANUAL', ahora: new Date() });
      expect(otra.status).toBe('ALREADY_RUN');
      const [{ n }] = (await q<{ n: string }>(
        'SELECT count(*)::text AS n FROM atlas_sales.merchant_invoices',
      )) as [{ n: string }];
      expect(n).toBe('1');
    });

    it('la clave del ciclo es el mes cerrado', () => {
      expect(cierre.hoyLocal(ahora)).toBe('2026-10-01');
    });
  },
);
