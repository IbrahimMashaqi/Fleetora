import { IsEmail, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { normalizeEmailInput } from '../../../common/utils/email.js';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'ibrahim@example.com' })
  @Transform(normalizeEmailInput)
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}
