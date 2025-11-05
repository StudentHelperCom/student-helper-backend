// src/auth/auth.service.ts
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

  async register(login: string, password: string) {
    // 1. DO NOT hash the login. Check for the user with the plaintext login.
    const existingUser = await this.usersService.findByEmail(login); //
    if (existingUser) {
      return { status: 'USER_ALREADY_EXISTS' };
    }

    // 2. ONLY hash the password.
    const hashedPassword = await this.hashService.hashData(password); //

    // 3. Create user with the PLAINTEXT login and HASHED password.
    const created = await this.usersService.createUser({ //
      login: login, // Store plaintext login
      password: hashedPassword, // Store hashed password
      lastActivityDate: new Date(),
    });

    // Generate JWT token
    const token = await this.jwtService.signAsync({
      sub: created.id,
      email: login, // Use original email in token
    });

    return { status: 'USER_ADDED', idu: token };
  }

  async login(login: string, password: string) {
    // 1. DO NOT hash the login. Find the user by their plaintext login.
    const user = await this.usersService.findByEmail(login); //
    if (!user) {
      return { status: 'USER_NOT_FOUND' };
    }

    // 2. Compare the provided password with the HASHED password from the DB.
    const isPasswordValid = await this.hashService.compareData(password, user.password); //
    if (!isPasswordValid) {
      return { status: 'INVALID_CREDENTIALS' };
    }

    // Generate JWT token
    const token = await this.jwtService.signAsync({
      sub: user.id,
      email: login, // Use original email in token
    });

    await this.usersService.updateLastActivity(user.id); //

    return { status: 'SUCCESS', idu: token };
  }
}