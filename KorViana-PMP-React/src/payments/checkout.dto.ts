import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CheckoutItemDto {
  @IsString()
  @Matches(/^[A-Z0-9-]{1,32}$/)
  sku!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;
}

export class CreateCheckoutDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  expectedTotal?: number;
}

export class VerifyCheckoutDto {
  @IsString()
  @Matches(/^order_[A-Za-z0-9]+$/)
  razorpay_order_id!: string;

  @IsString()
  @Matches(/^pay_[A-Za-z0-9]+$/)
  razorpay_payment_id!: string;

  @IsString()
  @Matches(/^[a-f\d]{64}$/i)
  razorpay_signature!: string;
}
