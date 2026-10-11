import {
  IsNotEmpty,
  IsString,
  IsUUID,
  Length,
  Matches,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @Matches(/(?=.*[A-Z])/, {
    message: 'Password must contain at least one uppercase letter (A-Z)',
  })
  newPassword!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @Length(64, 64)
  token!: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  @IsUUID()
  id!: string;
}
