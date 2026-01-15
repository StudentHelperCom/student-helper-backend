import { 
  ConflictException, 
  Injectable, 
  UnauthorizedException, 
  BadRequestException, 
  InternalServerErrorException
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
// ZMIANA: Importujemy UsersRepository z biblioteki zamiast lokalnego serwisu
import { UsersRepository, User } from '@repo/database';
import { HashService } from './common/hash.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly jwtService: JwtService,
    private readonly hashService: HashService,
    private readonly dataSource: DataSource,
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

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Sprawdź czy użytkownik istnieje z pessimistic lock (zapobiega race condition)
      const existing = await queryRunner.manager.findOne(User, {
        where: { email },
        lock: { mode: 'pessimistic_write' }
      });

      if (existing) {
        throw new ConflictException('User already exists');
      }

      // Utwórz użytkownika
      const created = queryRunner.manager.create(User, {
        email: email,
        passwordHash: hashedPassword,
        lastActivityDate: new Date(),
      });

      await queryRunner.manager.save(created);

      // Generuj token (jeśli to zawiedzie, rollback zapobiegnie utworzeniu użytkownika)
      const token = await this.jwtService.signAsync({
        sub: created.userID,
        email: email,
      });

      await queryRunner.commitTransaction();
      return { status: 'USER_ADDED', idu: token };

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      
      // Przekaż czytelne błędy dalej
      if (error instanceof ConflictException) {
        throw error;
      }
      
      // Postgres error code '23505' = unique_violation (backup check)
      if (error.code === '23505') {
        throw new ConflictException('User already exists');
      }
      
      throw new InternalServerErrorException('Registration failed');
    } finally {
      await queryRunner.release();
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

    // Transakcja zapewnia atomowość: lastActivity + token generation
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Update last activity
      await queryRunner.manager.update(User, user.userID, { 
        lastActivityDate: new Date() 
      });

      // Generuj token (jeśli to zawiedzie, rollback cofnie update)
      const token = await this.jwtService.signAsync({
        sub: user.userID,
        email: email,
      });

      await queryRunner.commitTransaction();
      return { status: 'SUCCESS', idu: token };

    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new InternalServerErrorException('Login failed');
    } finally {
      await queryRunner.release();
    }
  }
}