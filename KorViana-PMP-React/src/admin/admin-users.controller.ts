import {
  Controller,
  BadRequestException,
  Post,
  Body,
  Res,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Response } from 'express';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { Profile } from '../database/entities/profile.entity';
import { CsrfGuard } from '../security/csrf.guard';
import { AssignCustomerDto, CreateAssociateDto } from './associate.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
@Roles('admin')
export class AdminUsersController {
  constructor(@InjectRepository(Profile) private readonly profiles: Repository<Profile>) {}

  @Post('associates')
  async createAssociate(
    @Body() input: CreateAssociateDto,
    @Res() response: Response,
  ): Promise<void> {
    const email = input.email.trim().toLowerCase();
    if (Buffer.byteLength(input.password, 'utf8') > 72) {
      throw new BadRequestException('Password must be no more than 72 bytes.');
    }
    if (await this.profiles.existsBy({ email })) {
      response.redirect(303, `/dashboard?section=associates&error=${encodeURIComponent('An account with this email already exists.')}`);
      return;
    }

    try {
      await this.profiles.save(this.profiles.create({
        fullName: input.fullName.trim(),
        email,
        passwordHash: await bcrypt.hash(input.password, 12),
        phone: input.phone?.trim() || null,
        role: 'associate',
        isMaster: false,
        associateId: null,
      }));
    } catch (error) {
      if (error instanceof Error && 'driverError' in error
        && typeof error.driverError === 'object' && error.driverError !== null
        && 'code' in error.driverError && error.driverError.code === '23505') {
        response.redirect(303, `/dashboard?section=associates&error=${encodeURIComponent('An account with this email already exists.')}`);
        return;
      }
      throw error;
    }
    response.redirect(303, '/dashboard?section=associates&created=1');
  }

  @Post('customers/assign')
  async assignCustomer(
    @Body() input: AssignCustomerDto,
    @Res() response: Response,
  ): Promise<void> {
    const customer = await this.profiles.findOneBy({
      email: input.customerEmail.trim().toLowerCase(),
      role: 'customer',
    });
    const associate = await this.profiles.findOneBy({
      id: input.associateId,
      role: 'associate',
    });
    if (!customer || !associate) {
      response.redirect(303, `/dashboard?section=associates&error=${encodeURIComponent('Choose an existing customer and associate.')}`);
      return;
    }
    customer.associateId = associate.id;
    await this.profiles.save(customer);
    response.redirect(303, '/dashboard?section=associates&assigned=1');
  }
}
