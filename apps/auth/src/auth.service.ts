import { 
  ConflictException, 
  Injectable, 
  UnauthorizedException, 
  BadRequestException, 
  InternalServerErrorException
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersRepository } from '@repo/database';
import { HashService } from './common/hash.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly jwtService: JwtService,
    private readonly hashService: HashService,
  ) {}

  private validateCredentials(login: string, pass: string): string | null {
    // 1. Validation Logic: Define security rules for credentials
    // Login: Only Latin letters (a-z, A-Z) and numbers (0-9), length 6-30
    const loginRegex = /^[a-zA-Z0-9]{6,30}$/;
    
    // Password: Latin letters/numbers/common special symbols, length 6-30, at least 1 number and 1 special char
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
    // 2. Input Validation: Check credentials against security policies
    const validationError = this.validateCredentials(email, password);
    if (validationError) {
      throw new BadRequestException(validationError);
    }

    // 3. Security Processing: Hash the raw password before storage
    const hashedPassword = await this.hashService.hashData(password);

    try {
      // 4. Persistence: Create new user record in the database
      const created = await this.usersRepo.register({
        email,
        passwordHash: hashedPassword,
      });

      // 5. Token Generation: Issue a signed JWT for immediate access
      const token = await this.jwtService.signAsync({
        sub: created.userID,
        email: email,
      });

      // 6. Response Construction: Return success status and auth token
      return { status: 'USER_ADDED', idu: token };

    } catch (error: any) {
      // 7. Error Handling: Manage conflicts (e.g., duplicate users)
      if (error.message === 'USER_ALREADY_EXISTS') {
        throw new ConflictException('User already exists');
      }
      
      if (error.code === '23505') {
        throw new ConflictException('User already exists');
      }
      throw new InternalServerErrorException('Registration failed');
    }
  }

  async login(email: string, password: string) {    
    // 1. User Lookup: Retrieve user entity by email
    const user = await this.usersRepo.findByEmail(email); 
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // 2. Credential Verification: Compare provided password with stored hash
    const isPasswordValid = await this.hashService.compareData(password, user.passwordHash); 
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    try {
      // 3. Session Initialization: Generate a fresh JWT session token
      const token = await this.jwtService.signAsync({
        sub: user.userID,
        email: email,
      });

      // 4. Activity Tracking: Update the last login timestamp in DB
      await this.usersRepo.updateLastActivity(user.userID);

      // 5. Response Construction: Return success status and auth token
      return { status: 'SUCCESS', idu: token };
    } catch (error) {
      throw new InternalServerErrorException('Login failed');
    }
  }
}