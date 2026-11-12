import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../database/entities/profile.entity';
import { CsrfGuard } from '../security/csrf.guard';
import { UpdatePricingDto } from './pricing.dto';
import { PricingService } from './pricing.service';
import { Req } from '@nestjs/common';

@Controller('admin/pricing')
@UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
@Roles('admin')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Post()
  async update(
    @Body() input: UpdatePricingDto,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    await this.pricing.update(input, request.user);
    response.redirect(303, '/dashboard?section=pricing&saved=1');
  }
}
