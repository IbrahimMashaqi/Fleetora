import { IsNotEmpty, IsString, IsUUID, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
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
