// apps/auth/src/auth/auth.service.ts
import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { HashService } from '../common/hash.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly hashService: HashService,
  ) {}

  async register(email: string, password: string) { // Fix: use 'email' variable name
    const existingUser = await this.usersService.findByEmail(email); 
    if (existingUser) {
      return { status: 'USER_ALREADY_EXISTS' };
    }

    const hashedPassword = await this.hashService.hashData(password); 

    const created = await this.usersService.createUser({
      email: email, // Fix: Use 'email'
      passwordHash: hashedPassword, // Fix: Use 'passwordHash'
      lastActivityDate: new Date(),
    });

    const token = await this.jwtService.signAsync({
      sub: created.userID, // Fix: Use 'userID'
      email: email, 
    });

    return { status: 'USER_ADDED', idu: token };
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email); 
    if (!user) {
      return { status: 'USER_NOT_FOUND' };
    }

    // Fix: check against 'passwordHash'
    const isPasswordValid = await this.hashService.compareData(password, user.passwordHash); 
    if (!isPasswordValid) {
      return { status: 'INVALID_CREDENTIALS' };
    }

    const token = await this.jwtService.signAsync({
      sub: user.userID, // Fix: Use 'userID'
      email: email,
    });

    await this.usersService.updateLastActivity(user.userID); // Fix: Use 'userID'

    return { status: 'SUCCESS', idu: token };
  }
}