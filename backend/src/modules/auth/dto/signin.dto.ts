import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SigninDto {
  @ApiProperty({ example: 'ibrahim@example.com' })
  @IsEmail({}, { message: 'Email is invalid' })
  email!: string;

  @ApiProperty({ example: 'Passw0rd' })
  @IsString({ message: 'Password must be a string' })
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password!: string;
}
