import { 
  ConflictException, 
  Injectable, 
  UnauthorizedException, 
  BadRequestException // <--- Added this import
} from '@nestjs/common';
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
    // 3. Must have at least 1 number
    // 4. Must have at least 1 special char
    const passwordRegex = /^(?=.*[0-9])(?=.*[\W_])[a-zA-Z0-9\W_]{6,30}$/;

    if (!loginRegex.test(login)) {
      return 'Invalid login format. Must be 6-30 alphanumeric characters.';
    }
    
    if (!passwordRegex.test(pass)) {
      return 'Invalid password format. Must be 6-30 chars, with at least 1 number and 1 special char.';
    }

    return null;
  }

  async register(email: string, password: string) { 
    const validationError = this.validateCredentials(email, password);
    if (validationError) {
      throw new BadRequestException(validationError);
    }

    const existingUser = await this.usersService.findByEmail(email); 
    if (existingUser) {
      throw new ConflictException('User already exists');
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
      throw new UnauthorizedException('User not found');
    }

    const isPasswordValid = await this.hashService.compareData(password, user.passwordHash); 
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const token = await this.jwtService.signAsync({
      sub: user.userID,
      email: email,
    });

    await this.usersService.updateLastActivity(user.userID); 

    return { status: 'SUCCESS', idu: token };
  }
}