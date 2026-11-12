import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { isEmail } from 'class-validator';
import { Repository } from 'typeorm';
import { Profile } from './entities/profile.entity';
import { Product } from './entities/product.entity';
import { MetalRate } from './entities/metal-rate.entity';
import { DEFAULT_MARKUPS, DEFAULT_RATES, PricingService } from '../pricing/pricing.service';

@Injectable()
export class DatabaseSeeder implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(Profile) private readonly profiles: Repository<Profile>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(MetalRate) private readonly rates: Repository<MetalRate>,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (await this.products.count() === 0) {
      await this.products.save(this.products.create(PricingService.initialProducts()));
    }

    for (const metal of ['gold', 'silver'] as const) {
      if (!(await this.rates.exists({ where: { metal } }))) {
        await this.rates.save(this.rates.create({
          metal,
          baseRate: DEFAULT_RATES[metal].toFixed(2),
          markups: DEFAULT_MARKUPS[metal],
        }));
      }
    }

    const email = this.config.get<string>('ADMIN_EMAIL')?.trim().toLowerCase();
    const password = this.config.get<string>('ADMIN_PASSWORD');
    if (!email && !password) return;
    if (!email || !password) {
      throw new Error('Set both ADMIN_EMAIL and ADMIN_PASSWORD to provision the initial administrator.');
    }
    if (!isEmail(email)) {
      throw new Error('ADMIN_EMAIL must be a valid email address.');
    }
    if (await this.profiles.existsBy({ email })) return;

    if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
      throw new Error('ADMIN_PASSWORD must contain 12 to 72 UTF-8 bytes.');
    }
    await this.profiles.save(this.profiles.create({
      fullName: 'KorViana Administrator',
      email,
      passwordHash: await bcrypt.hash(password, 12),
      phone: null,
      role: 'admin',
      isMaster: true,
      associateId: null,
    }));
  }
}
