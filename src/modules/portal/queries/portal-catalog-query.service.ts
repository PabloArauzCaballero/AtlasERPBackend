import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import {
  BillingProductModel,
  MerchantPlanModel,
} from '../../b2b-sales-crm/models/b2b-sales-crm.models';
import {
  toBillingProductDto,
  toPlanDto,
  type PortalBillingProductDto,
  type PortalPlanDto,
} from '../portal.mappers';
import type { BillingProductsQueryDto, PlansQueryDto } from '../portal.schemas';

/** Lo que Atlas vende y factura: las tarifas y el catálogo de productos facturables. */
@Injectable()
export class PortalCatalogQueryService {
  constructor(
    @InjectModel(MerchantPlanModel) private readonly planModel: typeof MerchantPlanModel,
    @InjectModel(BillingProductModel)
    private readonly billingProductModel: typeof BillingProductModel,
  ) {}

  async listPlans(query: PlansQueryDto): Promise<PortalPlanDto[]> {
    const plans = await this.planModel.findAll({
      where: query.includeInactive === 'true' ? {} : { status: 'ACTIVE' },
      order: [
        ['sortOrder', 'ASC'],
        /* Por tarifa, no por cuota: `monthlyPrice` es cero en todos desde que se cobra por entrega. */
        ['cpmMicros', 'ASC'],
        ['code', 'ASC'],
      ],
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });

    return plans.map((plan) => toPlanDto(plan));
  }

  /**
   * Catálogo de lo que Atlas factura. Es de sólo lectura por diseño.
   *
   * Se siembra con la base de datos porque un producto sin cuenta de ingreso ni unidad de cobro
   * rompería la factura del comercio, y decidir esas dos cosas es del área contable, no de una
   * pantalla. Lo que sí se configura desde el ERP es el precio, que vive en cada tarifa.
   */
  async listBillingProducts(query: BillingProductsQueryDto): Promise<PortalBillingProductDto[]> {
    const products = await this.billingProductModel.findAll({
      where: query.includeInactive === 'true' ? {} : { status: 'ACTIVE' },
      order: [
        ['sortOrder', 'ASC'],
        ['code', 'ASC'],
      ],
    });
    return products.map((product) => toBillingProductDto(product));
  }
}
