import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { MetalRate } from '../database/entities/metal-rate.entity';
import { MetalRateHistory } from '../database/entities/metal-rate-history.entity';
import { Product } from '../database/entities/product.entity';
import { Profile } from '../database/entities/profile.entity';
import { UpdatePricingDto } from './pricing.dto';

export const DEFAULT_RATES = { gold: 78420, silver: 94200 };

export const DEFAULT_MARKUPS: Record<'gold' | 'silver', Record<string, number>> = {
  gold: { '1': 6.25, '2': 5.5, '5': 5, '10': 4.75, '50': 4.5, '100': 4.25 },
  silver: { '50': 6.25, '100': 5.5, '200': 5, '500': 4.75, '1000': 4.5 },
};

const WEIGHTS = {
  gold: [1, 2, 5, 10, 50, 100],
  silver: [50, 100, 200, 500, 1000],
} as const;

export type PricingSnapshot = {
  rates: { gold: number; silver: number };
  markups: { gold: Record<string, number>; silver: Record<string, number> };
  updatedAt: Date | null;
};

@Injectable()
export class PricingService {
  constructor(
    @InjectRepository(MetalRate) private readonly rates: Repository<MetalRate>,
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly dataSource: DataSource,
  ) {}

  async getSnapshot(): Promise<PricingSnapshot> {
    const records = await this.rates.find();
    const record = (metal: 'gold' | 'silver') => records.find((item) => item.metal === metal);
    const gold = record('gold');
    const silver = record('silver');
    return {
      rates: {
        gold: Number(gold?.baseRate ?? DEFAULT_RATES.gold),
        silver: Number(silver?.baseRate ?? DEFAULT_RATES.silver),
      },
      markups: {
        gold: gold?.markups ?? DEFAULT_MARKUPS.gold,
        silver: silver?.markups ?? DEFAULT_MARKUPS.silver,
      },
      updatedAt: gold && silver
        ? new Date(Math.max(gold.updatedAt.getTime(), silver.updatedAt.getTime()))
        : null,
    };
  }

  async getProducts(): Promise<Product[]> {
    return this.products.find({ where: { active: true }, order: { metal: 'ASC', weightGrams: 'ASC' } });
  }

  async update(dto: UpdatePricingDto, changedBy: Profile): Promise<void> {
    const snapshot: PricingSnapshot = {
      rates: { gold: dto.goldRate, silver: dto.silverRate },
      markups: {
        gold: {
          '1': dto.goldMarkup1, '2': dto.goldMarkup2, '5': dto.goldMarkup5,
          '10': dto.goldMarkup10, '50': dto.goldMarkup50, '100': dto.goldMarkup100,
        },
        silver: {
          '50': dto.silverMarkup50, '100': dto.silverMarkup100, '200': dto.silverMarkup200,
          '500': dto.silverMarkup500, '1000': dto.silverMarkup1000,
        },
      },
      updatedAt: new Date(),
    };

    await this.dataSource.transaction(async (manager) => {
      const rateRepository = manager.getRepository(MetalRate);
      const historyRepository = manager.getRepository(MetalRateHistory);
      const productRepository = manager.getRepository(Product);

      for (const metal of ['gold', 'silver'] as const) {
        const rate = rateRepository.create({
          metal,
          baseRate: snapshot.rates[metal].toFixed(2),
          markups: snapshot.markups[metal],
        });
        await rateRepository.save(rate);
        await historyRepository.save(historyRepository.create({
          metal,
          baseRate: rate.baseRate,
          markups: rate.markups,
          changedBy: changedBy.id,
        }));
      }

      const products = await productRepository.find();
      for (const product of products) {
        const metal = product.metal as 'gold' | 'silver';
        const grams = Number(product.weightGrams);
        const markup = snapshot.markups[metal][String(grams)];
        if (markup === undefined) continue;
        product.price = PricingService.calculatePrice(metal, snapshot.rates[metal], grams, markup).toFixed(2);
      }
      await productRepository.save(products);
    });
  }

  static initialProducts(): Array<Omit<Product, 'id' | 'createdAt' | 'updatedAt'>> {
    return (['gold', 'silver'] as const).flatMap((metal) =>
      WEIGHTS[metal].map((weight) => ({
        sku: `${metal.toUpperCase()}-${weight}G`,
        metal,
        purity: metal === 'gold' ? '24K · 99.99%' : '99.99%',
        weightGrams: weight.toFixed(3),
        price: PricingService.calculatePrice(
          metal,
          DEFAULT_RATES[metal],
          weight,
          DEFAULT_MARKUPS[metal][String(weight)],
        ).toFixed(2),
        active: true,
      })),
    );
  }

  static calculatePrice(
    metal: 'gold' | 'silver',
    baseRate: number,
    weightGrams: number,
    markupPercent: number,
  ): number {
    const rateCents = Math.round(baseRate * 100);
    const markupHundredths = Math.round(markupPercent * 100);
    const unitGrams = metal === 'gold' ? 10 : 1000;
    const numerator = BigInt(rateCents) * BigInt(weightGrams) * BigInt(10000 + markupHundredths);
    const denominator = BigInt(unitGrams) * 1000000n;
    return Number((numerator + denominator / 2n) / denominator);
  }
}
