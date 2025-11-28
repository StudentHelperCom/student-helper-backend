import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class ServiceHealthController {
  @Get()
  ping() {
    return { status: 'ok' };
  }
}