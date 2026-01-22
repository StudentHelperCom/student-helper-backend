import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { User } from '../entities/user.entity.js';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  findByEmail(email: string) {
    return this.repo.findOne({ where: { email } });
  }

  /**
   * Register user with pessimistic lock to prevent race conditions.
   * Returns created user. Runs in transaction.
   */
  async register(userData: {
    email: string;
    passwordHash: string;
  }): Promise<User> {
    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(User, {
        where: { email: userData.email },
        lock: { mode: 'pessimistic_write' },
      });

      if (existing) {
        throw new Error('USER_ALREADY_EXISTS');
      }

      const newUser = manager.create(User, {
        email: userData.email,
        passwordHash: userData.passwordHash,
        lastActivityDate: new Date(),
      });

      return manager.save(newUser);
    });
  }

  async updateLastActivity(userId: string): Promise<void> {
    await this.repo.update(userId, {
      lastActivityDate: new Date(),
    });
  }
}