/**
 * Núcleo fiscal del ERP contra PostgreSQL REAL migrado y contra el emulador REAL del SIN
 * (`AtlasExternalProvidersMock`, proveedor `siat`), arrancado como proceso aparte.
 *
 * Lo que demuestra: que el CUF, el XML y el hash que produce el dominio del ERP son los que el
 * emulador —que valida recalculando— acepta (908), que CUIS/CUFD/catálogos quedan en la base, que
 * la bitácora no guarda el token y que el alcance por entidad legal se aplica.
 *
 * El emulador se busca en `ERP_PROVIDERS_MOCK_DIR` (por defecto `../AtlasExternalProvidersMock`).
 * Sin él la suite se SALTA avisándolo; con `ERP_REQUIRE_PROVIDERS_MOCK=1` (CI) es un FALLO.
 */
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { getConnectionToken, SequelizeModule } from '@nestjs/sequelize';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import type { ChildProcess } from 'node:child_process';
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
import { calcularCuf } from '../src/modules/fiscal/siat/domain/cuf';
import { construirFacturaXml } from '../src/modules/fiscal/siat/domain/factura-xml';
import { fechaHoraLocal } from '../src/modules/fiscal/siat/domain/fecha-local';
import { calcularTotales } from '../src/modules/fiscal/siat/domain/montos';
import { comprimir } from '../src/modules/fiscal/siat/domain/paquete-tar';
import { JsonMockSiatTransport } from '../src/modules/fiscal/siat/infrastructure/json-mock-siat.transport';
import { OPERACIONES } from '../src/modules/fiscal/siat/infrastructure/siat-transport';
import { createMigratedDatabase } from './support/coverage-integration-db';
import {
  ADMIN,
  arrancarEmulador,
  describeWithMock,
  puertoLibre,
  silentLogger,
} from './support/siat-emulador';

import type { MigratedDatabase } from './support/coverage-integration-db';

describeWithMock('SIAT: núcleo fiscal del ERP ↔ emulador del SIN (PostgreSQL real)', () => {
  let db: MigratedDatabase;
  let moduleRef: TestingModule;
  let sequelize: Sequelize;
  let emulador: { url: string; proceso: ChildProcess };
  let gateway: SiatGatewayService;
  let perfiles: SiatIssuerProfileService;
  let credenciales: SiatCredentialsService;
  let catalogos: SiatCatalogSyncService;
  let estado: SiatStatusService;
  let legalEntityId: string;

  beforeAll(async () => {
    [db, emulador] = await Promise.all([createMigratedDatabase('siat_int'), arrancarEmulador()]);
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
        LegalEntityAccessService,
        { provide: PinoLoggerService, useValue: silentLogger },
      ],
    }).compile();
    sequelize = moduleRef.get<Sequelize>(getConnectionToken());
    gateway = moduleRef.get(SiatGatewayService);
    perfiles = moduleRef.get(SiatIssuerProfileService);
    credenciales = moduleRef.get(SiatCredentialsService);
    catalogos = moduleRef.get(SiatCatalogSyncService);
    estado = moduleRef.get(SiatStatusService);
    gateway.usarTransporte(
      new JsonMockSiatTransport(`${emulador.url}/mock/siat`, 'token-de-prueba-erp', 5000),
    );
    const [fila] = await sequelize.query<{ id: string }>(
      `INSERT INTO atlas_accounting.legal_entity (code, legal_name, tax_id)
       VALUES ('SIAT-T', 'Atlas Prueba SRL', '1003579028') RETURNING id`,
      { type: QueryTypes.SELECT },
    );
    legalEntityId = fila!.id;
  }, 180_000);

  afterAll(async () => {
    emulador?.proceso.kill();
    await moduleRef?.close();
    await db?.drop();
  });

  let perfilId: string;

  it('crea el emisor con su serie fiscal', async () => {
    const perfil = await perfiles.crear(
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
      },
      ADMIN,
    );
    perfilId = perfil.id;
    const [serie] = await sequelize.query<{ last_number: string }>(
      'SELECT last_number FROM atlas_accounting.siat_number_series WHERE issuer_profile_id = $1',
      { bind: [perfilId], type: QueryTypes.SELECT },
    );
    expect(serie?.last_number).toBe('0');
  });

  it('otra entidad legal no ve el emisor', async () => {
    await expect(
      perfiles.obtener(perfilId, {
        sub: 'x',
        role: 'accountant',
        legalEntityIds: ['00000000-0000-4000-8000-000000000000'],
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('pide CUIS y CUFD al emulador, los guarda y reutiliza el vigente', async () => {
    const perfil = await perfiles.obtener(perfilId, ADMIN);
    const cufd = await credenciales.cufdVigente(perfil);
    expect(cufd.codigoControl).toMatch(/^[0-9A-F]{15}$/);
    expect((await credenciales.cufdVigente(perfil)).id).toBe(cufd.id);
    const nuevo = await credenciales.cufdVigente(perfil, true);
    expect(nuevo.id).not.toBe(cufd.id);
    const activos = await sequelize.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM atlas_accounting.siat_cufd WHERE issuer_profile_id = $1 AND is_active',
      { bind: [perfilId], type: QueryTypes.SELECT },
    );
    expect(activos[0]?.n).toBe('1');
  });

  it('una factura armada por el dominio del ERP es VALIDADA (908) por el emulador', async () => {
    const perfil = await perfiles.obtener(perfilId, ADMIN);
    const cufd = await credenciales.cufdVigente(perfil);
    const cuis = await credenciales.cuisVigente(perfil);
    const fechaEmision = fechaHoraLocal(new Date(), 'America/La_Paz');
    const totales = calcularTotales(
      [
        { cantidad: '1', precioUnitario: '150.50' },
        { cantidad: '2', precioUnitario: '10.25', montoDescuento: '0.50' },
      ],
      { descuentoAdicional: '0' },
    );
    const cuf = calcularCuf({
      nit: perfil.nit,
      fechaEmision,
      codigoSucursal: 0,
      codigoModalidad: 2,
      codigoEmision: 1,
      tipoFacturaDocumento: 1,
      codigoDocumentoSector: 1,
      numeroFactura: 1,
      codigoPuntoVenta: 0,
      codigoControl: cufd.codigoControl,
    });
    const xml = construirFacturaXml(
      2,
      {
        nitEmisor: perfil.nit,
        razonSocialEmisor: perfil.razonSocial,
        municipio: perfil.municipio,
        telefono: null,
        numeroFactura: 1,
        cuf,
        cufd: cufd.codigo,
        codigoSucursal: 0,
        direccion: perfil.direccion,
        codigoPuntoVenta: 0,
        fechaEmision,
        nombreRazonSocial: 'Comercio & Cía <S.R.L.>',
        codigoTipoDocumentoIdentidad: 5,
        numeroDocumento: '123456789',
        complemento: null,
        codigoCliente: 'B2B-0001',
        codigoMetodoPago: 1,
        numeroTarjeta: null,
        montoTotal: totales.montoTotal,
        montoTotalSujetoIva: totales.montoTotalSujetoIva,
        codigoMoneda: 1,
        tipoCambio: '1',
        montoTotalMoneda: totales.montoTotalMoneda,
        montoGiftCard: null,
        descuentoAdicional: totales.descuentoAdicional,
        codigoExcepcion: 0,
        cafc: null,
        leyenda:
          'Ley N° 453: Tienes derecho a recibir información sobre los servicios que utilices.',
        usuario: perfil.usuarioEmisor,
        codigoDocumentoSector: 1,
      },
      totales.lineas.map((linea, indice) => ({
        actividadEconomica: '451010',
        codigoProductoSin: 49111,
        codigoProducto: `P-${indice + 1}`,
        descripcion: 'Comisión de servicio',
        cantidad: linea.cantidad,
        unidadMedida: 58,
        precioUnitario: linea.precioUnitario,
        montoDescuento: linea.montoDescuento,
        subTotal: linea.subTotal,
        numeroSerie: null,
        numeroImei: null,
      })),
    );
    const archivo = comprimir(xml);
    const { respuesta } = await gateway.llamar(perfilId, OPERACIONES.recepcionFactura, {
      ...gateway.solicitudBase(perfil),
      codigoDocumentoSector: 1,
      codigoEmision: 1,
      tipoFacturaDocumento: 1,
      cuis: cuis.codigo,
      cufd: cufd.codigo,
      archivo: archivo.gzip.toString('base64'),
      fechaEnvio: fechaHoraLocal(new Date(), 'America/La_Paz'),
      hashArchivo: archivo.sha256,
    });
    expect({ estado: respuesta.codigoEstado, mensajes: respuesta.mensajesList }).toEqual({
      estado: 908,
      mensajes: [],
    });
    expect(totales.montoTotal).toBe('170.50');
  });

  it('sincroniza los catálogos del SIN, marcados de prueba', async () => {
    const perfil = await perfiles.obtener(perfilId, ADMIN);
    const resultado = await catalogos.sincronizar(perfil);
    expect(Object.keys(resultado.catalogos)).toHaveLength(17);
    const leyendas = await catalogos.listar('LEYENDAS');
    expect(leyendas.length).toBeGreaterThan(0);
    expect(leyendas.every((fila) => fila.simulated)).toBe(true);
    expect(await catalogos.existe('MOTIVO_ANULACION', '1')).toBe(true);
    // Segunda pasada: reemplaza, no duplica.
    await catalogos.sincronizar(perfil);
    expect((await catalogos.listar('LEYENDAS')).length).toBe(leyendas.length);
  });

  it('el estado dice modo, comunicación y vigencias', async () => {
    const perfil = await perfiles.obtener(perfilId, ADMIN);
    const resultado = await estado.estado(perfil);
    expect(resultado).toMatchObject({ mode: 'mock_server', codigoAmbiente: 2, comunicacion: 926 });
    expect(resultado.cufdVigenteHasta).not.toBeNull();
    expect(resultado.ultimaSincronizacion?.ok).toBe(true);
  });

  it('la bitácora registra cada llamada y nunca el token', async () => {
    const filas = await sequelize.query<{ operacion: string; request: string; ok: boolean }>(
      `SELECT operacion, request_redacted::text AS request, ok
         FROM atlas_accounting.siat_transaction_log`,
      { type: QueryTypes.SELECT },
    );
    expect(filas.length).toBeGreaterThan(20);
    expect(filas.map((f) => f.operacion)).toEqual(
      expect.arrayContaining(['cuis', 'cufd', 'recepcionFactura']),
    );
    const todo = JSON.stringify(filas);
    expect(todo).not.toMatch(/token-de-prueba-erp|TokenApi|apikey/i);
    // El archivo tampoco viaja entero a la bitácora: sólo su tamaño y su hash.
    const recepcion = filas.find((f) => f.operacion === 'recepcionFactura')!;
    expect(JSON.parse(recepcion.request).archivo).toEqual(
      expect.objectContaining({ sha256: expect.any(String) }),
    );
  });

  it('un SIN que no responde es 503 y queda en la bitácora como fallo', async () => {
    const perfil = await perfiles.obtener(perfilId, ADMIN);
    const muerto = await puertoLibre();
    gateway.usarTransporte(
      new JsonMockSiatTransport(`http://127.0.0.1:${muerto}/mock/siat`, 't', 1000),
    );
    try {
      await expect(credenciales.cuisVigente(perfil, true)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(await credenciales.verificarComunicacion(true)).toBe(false);
    } finally {
      gateway.usarTransporte(
        new JsonMockSiatTransport(`${emulador.url}/mock/siat`, 'token-de-prueba-erp', 5000),
      );
    }
    const [fallo] = await sequelize.query<{ error: string }>(
      `SELECT error FROM atlas_accounting.siat_transaction_log
        WHERE NOT ok AND operacion = 'cuis' ORDER BY created_at DESC LIMIT 1`,
      { type: QueryTypes.SELECT },
    );
    expect(fallo?.error).toMatch(/^NETWORK/);
  });
});
