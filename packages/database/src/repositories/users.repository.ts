import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity.js';

@Injectable()
export class UsersRepository {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  findByEmail(email: string) {
    return this.repo.findOne({ where: { email } });
  }

  async createUser(userData: Partial<User>) {
    const newUser = this.repo.create(userData);
    return this.repo.save(newUser);
  }

  async updateLastActivity(id: string) {
    await this.repo.update(id, { lastActivityDate: new Date() });
  }
}