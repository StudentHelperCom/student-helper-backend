import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from './users/users.service';
import { HashService } from './common/hash.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly hashService: HashService,
  ) {}

  private validateCredentials(login: string, pass: string): string | null {
    // Login: Only Latin letters (a-z, A-Z) and numbers (0-9), length 6-30
    const loginRegex = /^[a-zA-Z0-9]{6,30}$/;
    
    // Password: 
    // 1. Allowed chars: Latin letters, numbers, and common special symbols
    // 2. Length 6-30
    // 3. Must have at least 1 number (?=.*[0-9])
    // 4. Must have at least 1 special char (?=.*[\W_])
    const passwordRegex = /^(?=.*[0-9])(?=.*[\W_])[a-zA-Z0-9\W_]{6,30}$/;

    if (!loginRegex.test(login)) {
      return 'INVALID_LOGIN_FORMAT';
    }
    
    if (!passwordRegex.test(pass)) {
      return 'INVALID_PASSWORD_FORMAT';
    }

    return null;
  }

  async register(email: string, password: string) { 
    const validationError = this.validateCredentials(email, password);
    if (validationError) {
      return { status: validationError };
    }

    const existingUser = await this.usersService.findByEmail(email); 
    if (existingUser) {
      return { status: 'USER_ALREADY_EXISTS' };
    }

    const hashedPassword = await this.hashService.hashData(password); 

    const created = await this.usersService.createUser({
      email: email,
      passwordHash: hashedPassword,
      lastActivityDate: new Date(),
    });

    const token = await this.jwtService.signAsync({
      sub: created.userID,
      email: email, 
    });

    return { status: 'USER_ADDED', idu: token };
  }

  async login(email: string, password: string) {    
    const user = await this.usersService.findByEmail(email); 
    if (!user) {
      return { status: 'USER_NOT_FOUND' };
    }

    const isPasswordValid = await this.hashService.compareData(password, user.passwordHash); 
    if (!isPasswordValid) {
      return { status: 'INVALID_CREDENTIALS' };
    }

    const token = await this.jwtService.signAsync({
      sub: user.userID,
      email: email,
    });

    await this.usersService.updateLastActivity(user.userID); 

    return { status: 'SUCCESS', idu: token };
  }
}