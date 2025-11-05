import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepo: Repository<UserEntity>,
  ) {}

  findByEmail(login: string) {
    return this.usersRepo.findOne({ where: { login } });
  }

  async createUser(userData: Partial<UserEntity>) {
    const newUser = this.usersRepo.create(userData);
    return this.usersRepo.save(newUser);
  }

  async updateLastActivity(id: string) {
    await this.usersRepo.update(id, { lastActivityDate: new Date() });
  }
}
