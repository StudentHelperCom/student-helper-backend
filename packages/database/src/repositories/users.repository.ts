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
   * TRANSACTIONAL: Register user with pessimistic lock to prevent race conditions.
   * Returns created user and generated token info.
   */
  async registerUserTransactional(userData: {
    email: string;
    passwordHash: string;
  }): Promise<User> {
    return this.dataSource.transaction(async (manager) => {
      // Check if user exists with pessimistic lock (prevents race condition)
      const existing = await manager.findOne(User, {
        where: { email: userData.email },
        lock: { mode: 'pessimistic_write' },
      });

      if (existing) {
        throw new Error('USER_ALREADY_EXISTS');
      }

      // Create and save user
      const newUser = manager.create(User, {
        email: userData.email,
        passwordHash: userData.passwordHash,
        lastActivityDate: new Date(),
      });

      return manager.save(newUser);
    });
  }

  /**
   * TRANSACTIONAL: Update last activity date atomically.
   * Ensures consistency between activity update and subsequent operations.
   */
  async updateLastActivityTransactional(userId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.update(User, userId, {
        lastActivityDate: new Date(),
      });
    });
  }
}