import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { AuthUser } from '../../../../common/types/auth-context.types';
import { MasterDataListings } from '../services/master-data-listings.service';

@Roles('admin', 'accountant', 'cfo')
@Controller('accounting/financial-structure')
export class FinancialStructureMasterDataController {
  constructor(private readonly masterData: MasterDataListings) {}

  @Get('cost-centers')
  listCostCenters(@CurrentUser() user: AuthUser) {
    return this.masterData.listCostCenters(user);
  }

  @Get('profit-centers')
  listProfitCenters(@CurrentUser() user: AuthUser) {
    return this.masterData.listProfitCenters(user);
  }

  @Get('bank-accounts')
  listBankAccounts(@CurrentUser() user: AuthUser) {
    return this.masterData.listBankAccounts(user);
  }
}
