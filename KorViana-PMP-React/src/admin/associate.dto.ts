import { Allow, IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateAssociateDto {
  @Allow()
  _csrf?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  fullName!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(72)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  phone?: string;
}

export class AssignCustomerDto {
  @Allow()
  _csrf?: string;

  @IsEmail()
  @MaxLength(254)
  customerEmail!: string;

  @IsUUID()
  associateId!: string;
}
