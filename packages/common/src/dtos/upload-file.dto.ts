import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class UploadFileDto {
  @ApiProperty({ example: 'lecture_notes.pdf', description: 'Name of the file' })
  @IsString()
  @IsNotEmpty()
  filename!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  content!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ example: 'Mathematics 101' })
  @IsString()
  @IsNotEmpty()
  className!: string;

  @ApiProperty({ example: '2025-06-15T09:00:00Z', required: false })
  @IsString()
  @IsOptional()
  examDate?: string;

  @ApiProperty({ example: 'Room 304', required: false })
  @IsString()
  @IsOptional()
  examLocation?: string;
}