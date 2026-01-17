import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, Matches, IsBase64, registerDecorator, ValidationArguments, ValidationOptions, MaxLength } from 'class-validator';

export class UploadFileDto {
  @ApiProperty({ 
    example: 'lecture_notes.pdf', 
    description: 'Name of the file. Allowed extensions: .pdf, .txt' 
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/\.(pdf|txt)$/i, {
    message: 'Invalid file format. Only .pdf and .txt files are allowed.',
  })
  filename!: string;

  @ApiProperty({ description: 'Base64 content' })
  @IsString()
  @IsNotEmpty()
  @IsBase64()
  @IsBase64SizeRaw(20 * 1024 * 1024) 
  content!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ example: 'Mathematics 101' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: 'Class name too long (max 100 chars)' })
  className!: string;

  @ApiProperty({ example: '2025-06-15T09:00:00Z', required: false })
  @IsString()
  @IsOptional()
  examDate?: string;

  @ApiProperty({ example: 'Room 304', required: false })
  @IsString()
  @IsOptional()
  @MaxLength(100, { message: 'Exam location name too long (max 100 chars)' })
  examLocation?: string;
}

export function IsBase64SizeRaw(maxSizeInBytes: number, validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isBase64SizeRaw',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [maxSizeInBytes],
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (typeof value !== 'string') return false;
          const sizeInBytes = value.length * 0.75; 
          const [maxSize] = args.constraints;
          return sizeInBytes <= maxSize;
        },
        defaultMessage(args: ValidationArguments) {
            const maxMb = args.constraints[0] / (1024 * 1024);
            return `File is too large. Maximum allowed size is ${maxMb}MB`;
        }
      },
    });
  };
}