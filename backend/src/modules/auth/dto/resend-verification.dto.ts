import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResendVerificationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'User ID or email is required' })
  userId!: string;
}
