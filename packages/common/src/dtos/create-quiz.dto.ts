import { IsArray, IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum StudyMode {
  QUIZ = 'Quiz',
  CARDS = 'Cards',
  EXPANDED = 'Expanded',
  SUMMARY = 'Summary'
}

export class CreateQuizDto {
  @ApiProperty({ example: 'Quiz', enum: StudyMode })
  @IsEnum(StudyMode)
  mode!: StudyMode;

  @ApiProperty({ example: ['uuid-1', 'uuid-2'], description: 'Topics ID list' })
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  topicIds!: string[];
}