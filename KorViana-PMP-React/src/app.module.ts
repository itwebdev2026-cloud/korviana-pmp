import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { Profile } from './database/entities/profile.entity';
import { Product } from './database/entities/product.entity';
import { OrderEntity } from './database/entities/order.entity';
import { OrderItem } from './database/entities/order-item.entity';
import { Payment } from './database/entities/payment.entity';
import { Installment } from './database/entities/installment.entity';
import { MetalRate } from './database/entities/metal-rate.entity';
import { MetalRateHistory } from './database/entities/metal-rate-history.entity';
import { Commission } from './database/entities/commission.entity';
import { Notification } from './database/entities/notification.entity';
import { InitialSchema1780000000000 } from './database/migrations/initial-schema.migration';
import { DatabaseSeeder } from './database/seed.service';
import { PagesController } from './pages/pages.controller';
import { PricingService } from './pricing/pricing.service';
import { PricingController } from './pricing/pricing.controller';
import { PaymentsController } from './payments/payments.controller';
import { PaymentsService } from './payments/payments.service';
import { RazorpayService } from './payments/razorpay.service';
import { CsrfGuard } from './security/csrf.guard';
import { AdminUsersController } from './admin/admin-users.controller';

const entities = [
  Profile, Product, OrderEntity, OrderItem, Payment, Installment, MetalRate,
  MetalRateHistory, Commission, Notification,
];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (environment) => {
        const secret = environment.JWT_SECRET;
        if (!secret || secret.length < 32 || secret === 'replace-with-a-long-random-secret') {
          throw new Error('Set JWT_SECRET to a unique random value of at least 32 characters.');
        }
        if (!environment.DATABASE_URL) {
          throw new Error('Set DATABASE_URL before starting the NestJS application.');
        }
        return environment;
      },
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.getOrThrow<string>('DATABASE_URL'),
        ssl: config.get<string>('DATABASE_SSL') === 'true'
          ? { rejectUnauthorized: false }
          : undefined,
        entities,
        migrations: [InitialSchema1780000000000],
        migrationsRun: true,
        synchronize: false,
      }),
    }),
    TypeOrmModule.forFeature(entities),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '8h' },
      }),
    }),
  ],
  controllers: [
    PagesController, AuthController, PricingController, PaymentsController,
    AdminUsersController,
  ],
  providers: [
    AuthService, JwtAuthGuard, RolesGuard, CsrfGuard, DatabaseSeeder,
    PricingService, PaymentsService, RazorpayService,
  ],
})
export class AppModule {}
