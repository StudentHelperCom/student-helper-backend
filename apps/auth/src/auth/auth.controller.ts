import { Controller, Post, Body, Get } from '@nestjs/common';
import { ApiTags, ApiBody } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AuthDto } from '@repo/database';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('health')
  healthCheck() {
    return 'OK';
  }

  @Post('register')
  @ApiBody({ type: AuthDto })
  async register(@Body() dto: AuthDto) {
    return this.authService.register(dto.login, dto.password);
  }

  @Post('login')
  @ApiBody({ type: AuthDto })
  async login(@Body() dto: AuthDto) {
    return this.authService.login(dto.login, dto.password);
  }
}
