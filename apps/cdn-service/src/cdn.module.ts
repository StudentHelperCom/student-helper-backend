import { Module } from '@nestjs/common';
import { CdnService } from './cdn.service';
import { CdnController } from './cdn.controller';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm'
import { ClassEntity, UserEntity } from '@repo/database';
import { TopicEntity } from '@repo/database';

@Module({
  controllers: [CdnController],
  providers: [CdnService],
  imports: [
    HttpModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forFeature([ClassEntity, TopicEntity, UserEntity]),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST!,
      port: 5432,
      username: process.env.DB_USER!,
      password: process.env.DB_PASS!,
      database: process.env.DB_NAME!,
      entities: [ClassEntity, TopicEntity, UserEntity],
      synchronize: true,
      ssl: { rejectUnauthorized: false },
      autoLoadEntities: true,
    }),
  
  ]
})
export class CdnModule {}
