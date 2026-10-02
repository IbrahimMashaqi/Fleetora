import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  newPassword!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  oldPassword!: string;
}
