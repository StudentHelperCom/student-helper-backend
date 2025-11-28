// apps/api-gateway/src/health.controller.ts
import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HttpHealthIndicator } from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { ApiOperation } from '@nestjs/swagger';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    private config: ConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Pings all the microservice apps' })
  @HealthCheck()
  check() {
    const authUrl = this.config.get<string>('AUTH_URL');
    const cdnUrl = this.config.get<string>('CDN_URL');
    const procUrl = this.config.get<string>('PROCESSING_URL');

    return this.health.check([
      () => this.http.pingCheck('auth_service', `${authUrl}/health`), 
      () => this.http.pingCheck('cdn_service', `${cdnUrl}/health`),
      () => this.http.pingCheck('processing_service', `${procUrl}/health`),
    ]);
  }
}