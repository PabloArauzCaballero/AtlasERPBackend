import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CatalogsService } from '../services/catalogs.service';

@Roles('COMMERCIAL_EXECUTIVE', 'COMMERCIAL_MANAGER', 'ADMIN', 'FINANCE', 'ACCOUNTANT')
@Controller('b2b')
export class CatalogsController {
  constructor(private readonly service: CatalogsService) {}

  @Get('internal-users')
  listInternalUsers() {
    return this.service.listInternalUsers();
  }

  @Get('contracts-catalog')
  listContracts() {
    return this.service.listContracts();
  }

  @Get('receivables')
  listReceivables(@Query('accountId') accountId?: string) {
    return this.service.listReceivables(accountId);
  }
}
