import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';

export class CreateClassDto {
  @ApiProperty({ example: 'Mathematics 101' })
  @IsString()
  @IsNotEmpty()
  className!: string;

  // This usually comes from the Gateway injecting it, 
  // but we need to validate it exists in the body arriving at Microservice
  @ApiProperty({ example: 'user-uuid-123' })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ example: '2025-06-15T09:00:00Z', required: false })
  @IsOptional()
  @IsDateString() // Ensures it's a valid ISO date
  examDate?: string;

  @ApiProperty({ example: 'Room 304', required: false })
  @IsOptional()
  @IsString()
  examLocation?: string;
}