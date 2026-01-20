import { Module, DynamicModule, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User } from './entities/user.entity.js';
import { Class } from './entities/class.entity.js';
import { Topic } from './entities/topic.entity.js';
import { TopicsRepository } from './repositories/topics.repository.js';
import { ClassesRepository } from './repositories/classes.repository.js';
import { UsersRepository } from './repositories/users.repository.js';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([User, Class, Topic]),
  ],
  providers: [
    UsersRepository,
    TopicsRepository,
    ClassesRepository,
  ],
  exports: [
    UsersRepository,
    TopicsRepository,
    ClassesRepository,
    TypeOrmModule, 
  ],
})
export class SharedDatabaseModule {
  static forRoot(): DynamicModule {
    return {
      module: SharedDatabaseModule,
      imports: [
        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            type: 'postgres',
            host: config.get<string>('DB_HOST'),
            port: config.get<number>('DB_PORT'),
            username: config.get<string>('DB_USER'),
            password: config.get<string>('DB_PASS'),
            database: config.get<string>('DB_NAME'),
            entities: [User, Class, Topic],
            synchronize: config.get('NODE_ENV') !== 'production',
            ssl: config.get<boolean>('DB_SSL') 
              ? { rejectUnauthorized: false } 
              : false,
          }),
        }),
      ],
    };
  }
}