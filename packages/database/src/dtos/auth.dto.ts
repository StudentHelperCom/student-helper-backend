// In your gateway project
import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength, IsNotEmpty } from 'class-validator';

export class AuthDto {
  @ApiProperty({
    example: 'student123',
    description: 'Unique user login name',
  })
  @IsString({ message: 'Login must be a string.' })
  @IsNotEmpty({ message: 'Login cannot be empty.' })
  @MaxLength(100, { message: 'Login can have at most 100 characters.' })
  login: string; // Note: Changed to 'email' to match your gateway

  @ApiProperty({
    example: 'Password123!',
    description: 'User password (min 6 characters, max 30)',
  })
  @IsString({ message: 'Password must be a string.' })
  @IsNotEmpty({ message: 'Password cannot be empty.' })
  @MinLength(6, { message: 'Password must be at least 6 characters long.' })
  @MaxLength(30, { message: 'Password can have at most 30 characters.' })
  password: string;
}