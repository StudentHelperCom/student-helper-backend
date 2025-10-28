import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ClientsModule.registerAsync([
      {
        name: 'CDN_SERVICE',
        useFactory: () => ({
          transport: Transport.TCP,
          options: {
            host: process.env.CDN_HOST || 'localhost',
            port: parseInt(process.env.CDN_PORT || '4001'),
          },
        }),
      },
    ]),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
