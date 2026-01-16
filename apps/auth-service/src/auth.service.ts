import { 
  ConflictException, 
  Injectable, 
  UnauthorizedException, 
  BadRequestException, 
  InternalServerErrorException
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
// ZMIANA: Importujemy UsersRepository z biblioteki zamiast lokalnego serwisu
import { UsersRepository, User } from '@repo/database';
import { HashService } from './common/hash.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepo: UsersRepository,
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

    // Hashowanie może zająć chwilę, robimy to przed transakcją
    const hashedPassword = await this.hashService.hashData(password);

    try {
      // Repository handles transaction with pessimistic lock
      const created = await this.usersRepo.register({
        email,
        passwordHash: hashedPassword,
      });

      // Generuj token po pomyślnej rejestracji
      const token = await this.jwtService.signAsync({
        sub: created.userID,
        email: email,
      });

      return { status: 'USER_ADDED', idu: token };

    } catch (error: any) {
      // Handle specific error from repository
      if (error.message === 'USER_ALREADY_EXISTS') {
        throw new ConflictException('User already exists');
      }
      
      // Postgres error code '23505' = unique_violation (backup check)
      if (error.code === '23505') {
        throw new ConflictException('User already exists');
      }
      
      throw new InternalServerErrorException('Registration failed');
    }
  }

  async login(email: string, password: string) {    
    const user = await this.usersRepo.findByEmail(email); 
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isPasswordValid = await this.hashService.compareData(password, user.passwordHash); 
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    try {
      // Generuj token
      const token = await this.jwtService.signAsync({
        sub: user.userID,
        email: email,
      });

      // Repository handles transaction for activity update
      await this.usersRepo.updateLastActivity(user.userID);

      return { status: 'SUCCESS', idu: token };

    } catch (error) {
      throw new InternalServerErrorException('Login failed');
    }
  }
}