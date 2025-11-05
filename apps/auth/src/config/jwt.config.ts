import { JwtModuleOptions } from '@nestjs/jwt';

export const jwtConfig: JwtModuleOptions = {
  secret: `${process.env.AUTH_ACCESS_TOKEN_SECRET}`,
  signOptions: {
    expiresIn: '10y',
  },
};
