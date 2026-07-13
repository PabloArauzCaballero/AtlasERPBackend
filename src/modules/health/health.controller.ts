import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get('health')
  health(): { status: 'ok'; service: string } {
    return this.healthService.health();
  }

  @Public()
  @Get('ready')
  ready(): Promise<{ status: 'ready'; database: 'ok' }> {
    return this.healthService.ready();
  }
}
