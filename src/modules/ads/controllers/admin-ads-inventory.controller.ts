import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../../common/types/auth-context.types';
import { RequestId } from '../decorators/request-id.decorator';
import { AdminAdsService } from '../services/admin-ads.service';
import { createInventoryPlacementSchema, listInventoryQuerySchema } from '../ads.schemas';
import type { CreateInventoryPlacementDto, ListInventoryQueryDto } from '../ads.dtos';

@Controller('admin/ads')
export class AdminAdsInventoryController {
  constructor(private readonly adminAdsService: AdminAdsService) {}

  @Get('inventory')
  @Roles(
    'ADS_ADMIN_VIEWER',
    'ADS_ADMIN_MANAGER',
    'ADS_ADMIN_OPERATOR',
    'ADS_INVENTORY_MANAGER',
    'ADS_AUDITOR',
  )
  listInventory(
    @Query(new ZodValidationPipe(listInventoryQuerySchema)) query: ListInventoryQueryDto,
  ) {
    return this.adminAdsService.listInventory(query);
  }

  @Post('inventory')
  @Roles('ADS_INVENTORY_MANAGER')
  createInventory(
    @Body(new ZodValidationPipe(createInventoryPlacementSchema)) body: CreateInventoryPlacementDto,
    @CurrentUser() user: AuthUser,
    @RequestId() requestId: string,
  ) {
    return this.adminAdsService.createInventoryPlacement(body, { user, requestId });
  }
}
