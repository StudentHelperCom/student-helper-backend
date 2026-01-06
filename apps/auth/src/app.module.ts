import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { SharedDatabaseModule } from '@repo/database';
import { configValidationSchema } from '@repo/common';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: configValidationSchema,
      envFilePath: '.env',
    }),
    SharedDatabaseModule.forRoot(),
    AuthModule,
    UsersModule,
  ],
})
export class AppModule {}