import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { UniqueConstraintError, type WhereOptions } from 'sequelize';
import { PinoLoggerService } from '../../../common/logger/pino-logger.service';
import { SupplierPaymentTermsModel } from '../../../database/models/supplier_payment_terms.model';
import { buildPaymentTermsCatalog } from './payment-terms.catalog';
import type { BaseDeComputo, MedioDePago, ModalidadDePago } from './payment-terms.catalog';
import { calcularFechasDePago, revisarCondicion, type CondicionDePago } from './payment-schedule';
import type {
  CreateSupplierPaymentTermsDto,
  ListSupplierPaymentTermsQueryDto,
  SimulateSupplierScheduleDto,
  UpdateSupplierPaymentTermsDto,
} from './supplier-payment-terms.schemas';

/**
 * Condiciones de pago a proveedor.
 *
 * La tabla, el modelo, el catálogo de vocabulario y el cálculo del calendario existían con sus
 * pruebas desde que se creó `006_supplier_payment_terms.sql`, y NADA los llamaba: no había servicio
 * ni endpoint, así que «cómo se le paga a este proveedor» seguía sin poder consultarse ni pactarse
 * desde el ERP —que es exactamente lo que la tabla venía a arreglar—. El catálogo incluso decía de
 * sí mismo que «se sirve por HTTP», y no lo servía nadie.
 *
 * Este servicio es el tramo que faltaba. Aporta una sola regla propia, y las demás las delega en el
 * dominio: **una condición se revisa ANTES de guardarla**. Validar al pagar y no al pactar es la
 * diferencia entre corregir un dato mientras se tiene delante al proveedor y descubrir en la
 * corrida del viernes que veinte facturas no se pueden emitir.
 */
@Injectable()
export class SupplierPaymentTermsService {
  constructor(
    private readonly logger: PinoLoggerService,
    @InjectModel(SupplierPaymentTermsModel)
    private readonly model: typeof SupplierPaymentTermsModel,
  ) {}

  /** El vocabulario con su explicación, para que la pantalla no copie las listas. */
  catalog() {
    return buildPaymentTermsCatalog();
  }

  async list(query: ListSupplierPaymentTermsQueryDto): Promise<Record<string, unknown>[]> {
    const where: Record<string, unknown> = {};
    if (query.legalEntityId) where.legalEntityId = query.legalEntityId;
    if (query.supplierBpId) where.supplierBpId = query.supplierBpId;
    if (query.status) where.status = query.status;

    const rows = await this.model.findAll({
      where: where as WhereOptions,
      order: [
        ['supplier_bp_id', 'ASC'],
        ['valid_from', 'DESC'],
      ],
    });
    return rows.map((row) => this.toResponse(row));
  }

  async get(id: string): Promise<Record<string, unknown>> {
    return this.toResponse(await this.find(id));
  }

  async create(input: CreateSupplierPaymentTermsDto, actorUserId?: string) {
    this.revisar(this.toCondicion(input));

    try {
      const created = await this.model.create({
        ...input,
        description: input.description ?? null,
        bpBankAccountId: input.bpBankAccountId ?? null,
        specialConditions: input.specialConditions ?? null,
        notes: input.notes ?? null,
        validTo: input.validTo ?? null,
        createdBy: actorUserId ?? null,
      });
      this.logger.info('Condición de pago a proveedor creada.', {
        layer: 'service',
        module: 'supplier-payment-terms',
        action: 'create',
        supplierBpId: input.supplierBpId,
        code: input.code,
      });
      return this.toResponse(created);
    } catch (error) {
      throw this.traducirConflicto(error, input.currencyCode);
    }
  }

  async update(id: string, input: UpdateSupplierPaymentTermsDto) {
    const row = await this.find(id);
    /* Se revisa la condición RESULTANTE, no el parche: cambiar sólo el medio de pago puede dejar
     * una condición que exige cuenta bancaria sin cuenta, y eso no se ve mirando el cambio. */
    const resultante = { ...this.toCondicion(row), ...this.toCondicion(input as never) };
    this.revisar(resultante);

    try {
      /* `updated_at` a mano: el modelo lleva `timestamps: false`, así que Sequelize no lo toca y una
       * condición renegociada quedaría con la fecha del día en que se pactó la anterior. */
      await row.update({ ...this.limpiar(input), updatedAtValue: new Date() });
      return this.toResponse(row);
    } catch (error) {
      throw this.traducirConflicto(error, row.currencyCode);
    }
  }

  /**
   * En qué fecha vence una factura con esta condición, y cuánto se adelanta.
   *
   * Se simula contra una condición CONCRETA y no contra «la vigente del proveedor» porque el motivo
   * de que la condición sea histórica es precisamente ese: una factura de hace seis meses vence con
   * la condición de entonces, no con la de hoy.
   */
  async simulate(id: string, input: SimulateSupplierScheduleDto) {
    const row = await this.find(id);
    const condicion = this.toCondicion(row);
    const problemas = revisarCondicion(condicion);

    return {
      paymentTermsId: row.id,
      code: row.code,
      currencyCode: row.currencyCode,
      /* Los problemas viajan en la respuesta en vez de tumbarla: se simula justamente para ver
       * qué pasaría, y una condición imperfecta guardada en su día sigue teniendo un vencimiento. */
      problems: problemas,
      schedule: calcularFechasDePago(condicion, {
        fechaFactura: input.invoiceDate,
        ...(input.receptionDate ? { fechaRecepcion: input.receptionDate } : {}),
        importe: input.amount,
      }),
    };
  }

  private revisar(condicion: CondicionDePago): void {
    const problemas = revisarCondicion(condicion);
    if (problemas.length > 0) {
      throw new UnprocessableEntityException({
        code: 'PAYMENT_TERMS_INVALID',
        message: 'La condición no se puede ejecutar tal y como está.',
        details: problemas,
      });
    }
  }

  private async find(id: string): Promise<SupplierPaymentTermsModel> {
    const row = await this.model.findByPk(id);
    if (!row) {
      throw new NotFoundException({
        code: 'PAYMENT_TERMS_NOT_FOUND',
        message: 'La condición de pago no existe.',
      });
    }
    return row;
  }

  /**
   * El índice único parcial deja UNA condición activa por proveedor y moneda. Sin traducirlo, el
   * segundo intento sale como un error de restricción con el nombre del índice, que no dice qué
   * hacer; con él, dice exactamente qué hay que suspender primero.
   */
  private traducirConflicto(error: unknown, currencyCode: string): unknown {
    if (error instanceof UniqueConstraintError) {
      return new ConflictException({
        code: 'PAYMENT_TERMS_ALREADY_ACTIVE',
        message: `Ese proveedor ya tiene una condición ACTIVA en ${currencyCode}. Suspende la vigente antes de activar otra, o guarda ésta como BORRADOR.`,
      });
    }
    return error;
  }

  private limpiar(input: UpdateSupplierPaymentTermsDto): Record<string, unknown> {
    return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
  }

  /** Del registro (o del cuerpo) a la condición que entiende el dominio. */
  private toCondicion(source: {
    modality?: string;
    computationBase?: string;
    termDays?: number;
    paymentMethod?: string;
    advancePercentage?: string | number;
    bpBankAccountId?: string | null;
  }): CondicionDePago {
    return {
      modalidad: source.modality as ModalidadDePago,
      baseDeComputo: (source.computationBase ?? 'FECHA_FACTURA') as BaseDeComputo,
      plazoDias: Number(source.termDays ?? 0),
      medioDePago: source.paymentMethod as MedioDePago,
      porcentajeAnticipo: Number(source.advancePercentage ?? 0),
      cuentaBancariaId: source.bpBankAccountId ?? null,
    };
  }

  private toResponse(row: SupplierPaymentTermsModel): Record<string, unknown> {
    return {
      id: row.id,
      legalEntityId: row.legalEntityId,
      supplierBpId: row.supplierBpId,
      code: row.code,
      name: row.name,
      description: row.description,
      currencyCode: row.currencyCode,
      modality: row.modality,
      computationBase: row.computationBase,
      termDays: row.termDays,
      frequency: row.frequency,
      paymentMethod: row.paymentMethod,
      bpBankAccountId: row.bpBankAccountId,
      /* `NUMERIC` llega como texto; aquí es un porcentaje corto y se sirve como número para que la
       * pantalla no tenga que decidir cómo leerlo. */
      advancePercentage: Number(row.advancePercentage),
      withholdingCodes: row.withholdingCodes ?? [],
      earlyPaymentDiscount: Number(row.earlyPaymentDiscount),
      specialConditions: row.specialConditions,
      notes: row.notes,
      status: row.status,
      validFrom: row.validFrom,
      validTo: row.validTo,
      createdAt: row.createdAtValue,
      updatedAt: row.updatedAtValue,
    };
  }
}
