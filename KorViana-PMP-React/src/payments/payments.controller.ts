import { Body, Controller, ForbiddenException, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CsrfGuard } from '../security/csrf.guard';
import { CreateCheckoutDto, VerifyCheckoutDto } from './checkout.dto';
import { PaymentsService } from './payments.service';

@Controller('api/payments')
@UseGuards(JwtAuthGuard, CsrfGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('orders')
  createOrder(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateCheckoutDto,
  ) {
    if (request.user.role !== 'customer') {
      throw new ForbiddenException('Only customer accounts can place orders.');
    }
    return this.payments.createOrder(request.user, input.items, input.expectedTotal);
  }

  @Post('verify')
  verify(
    @Req() request: AuthenticatedRequest,
    @Body() input: VerifyCheckoutDto,
  ) {
    if (request.user.role !== 'customer') {
      throw new ForbiddenException('Only customer accounts can place orders.');
    }
    return this.payments.verifyPayment(
      request.user,
      input.razorpay_order_id,
      input.razorpay_payment_id,
      input.razorpay_signature,
    );
  }
}
