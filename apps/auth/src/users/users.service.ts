import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '@repo/database';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  findByEmail(email: string) {
    return this.usersRepo.findOne({ where: { email } });
  }

  async createUser(userData: Partial<User>) {
    const newUser = this.usersRepo.create(userData);
    return this.usersRepo.save(newUser);
  }

  async updateLastActivity(id: string) {
    await this.usersRepo.update(id, { lastActivityDate: new Date() });
  }
}
