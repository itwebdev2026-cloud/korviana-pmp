import { Allow, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @Allow()
  _csrf?: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(72)
  password!: string;
}

export class RegisterDto extends LoginDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  fullName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  phone?: string;
}
