import { Global, Module } from '@nestjs/common';
import { PinoLoggerModule } from '../logging/pino-logger.module';

@Global()
@Module({
  imports: [PinoLoggerModule],
  exports: [PinoLoggerModule],
})
export class LoggerModule {}
