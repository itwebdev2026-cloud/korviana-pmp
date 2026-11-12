import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Request, Response } from 'express';
import { In, Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { Profile } from '../database/entities/profile.entity';
import { OrderEntity } from '../database/entities/order.entity';
import { OrderItem } from '../database/entities/order-item.entity';
import { Payment } from '../database/entities/payment.entity';
import { Installment } from '../database/entities/installment.entity';
import { Commission } from '../database/entities/commission.entity';
import { PricingService } from '../pricing/pricing.service';

@Controller()
export class PagesController {
  constructor(
    private readonly auth: AuthService,
    private readonly pricing: PricingService,
    @InjectRepository(OrderEntity) private readonly orders: Repository<OrderEntity>,
    @InjectRepository(OrderItem) private readonly orderItems: Repository<OrderItem>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(Installment) private readonly installments: Repository<Installment>,
    @InjectRepository(Commission) private readonly commissions: Repository<Commission>,
    @InjectRepository(Profile) private readonly profiles: Repository<Profile>,
  ) {}

  @Get()
  async home(@Req() request: Request, @Res() response: Response): Promise<void> {
    const [pricing, products] = await Promise.all([
      this.pricing.getSnapshot(),
      this.pricing.getProducts(),
    ]);
    response.render('home', {
      csrfToken: request.cookies?.korviana_csrf ?? '',
      pricing,
      products,
    });
  }

  @Get('login')
  login(
    @Req() request: Request,
    @Query('role') roleQuery: string | undefined,
    @Query('mode') modeQuery: string | undefined,
    @Query('error') errorQuery: string | undefined,
    @Res() response: Response,
  ): void {
    const role = ['customer', 'associate', 'agent', 'admin'].includes(roleQuery ?? '')
      ? roleQuery as string
      : 'customer';
    response.render('login', {
      csrfToken: request.cookies?.korviana_csrf ?? '',
      role,
      mode: modeQuery === 'register' ? 'register' : 'login',
      error: typeof errorQuery === 'string' ? errorQuery : '',
    });
  }

  @Get(['about', 'about.html'])
  about(@Req() request: Request, @Res() response: Response): void {
    response.render('about', { csrfToken: request.cookies?.korviana_csrf ?? '' });
  }

  @Get(['associates', 'associates.html'])
  associates(@Req() request: Request, @Res() response: Response): void {
    response.render('associates', { csrfToken: request.cookies?.korviana_csrf ?? '' });
  }

  @Get(['purchase', 'purchase.html'])
  async purchase(@Req() request: Request, @Res() response: Response): Promise<void> {
    const [pricing, products] = await Promise.all([
      this.pricing.getSnapshot(),
      this.pricing.getProducts(),
    ]);
    response.render('purchase', {
      csrfToken: request.cookies?.korviana_csrf ?? '',
      pricing,
      products,
    });
  }

  @Get('dashboard')
  async dashboard(
    @Req() request: Request,
    @Query('section') sectionQuery: string | undefined,
    @Query('saved') savedQuery: string | undefined,
    @Query('created') createdQuery: string | undefined,
    @Query('assigned') assignedQuery: string | undefined,
    @Query('error') errorQuery: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const token = request.cookies?.korviana_token;
    const profile = token ? await this.auth.verifyToken(token) : null;
    if (!profile) {
      response.clearCookie('korviana_token', { path: '/' });
      response.redirect('/login?error=Please%20sign%20in%20to%20continue.');
      return;
    }

    const [pricing, products, orders] = await Promise.all([
      this.pricing.getSnapshot(),
      this.pricing.getProducts(),
      this.loadOrders(profile),
    ]);
    const orderIds = orders.map((order) => order.id);
    const [
      items,
      payments,
      installments,
      commissions,
      customers,
      customerProfiles,
      associates,
      profileCount,
      orderCount,
    ] = await Promise.all([
      orderIds.length
        ? this.orderItems.find({ where: { orderId: In(orderIds) }, order: { createdAt: 'DESC' } })
        : Promise.resolve([]),
      profile.role === 'customer'
        ? this.payments.find({ where: { customerId: profile.id }, order: { createdAt: 'DESC' } })
        : Promise.resolve([]),
      orderIds.length
        ? this.installments.find({ where: { orderId: In(orderIds) }, order: { dueDate: 'ASC' } })
        : Promise.resolve([]),
      profile.role === 'associate'
        ? this.commissions.find({ where: { associateId: profile.id }, order: { createdAt: 'DESC' } })
        : Promise.resolve([]),
      profile.role === 'associate'
        ? this.profiles.find({ where: { associateId: profile.id, role: 'customer' }, order: { createdAt: 'DESC' } })
        : Promise.resolve([]),
      profile.role === 'admin'
        ? this.profiles.find({ where: { role: 'customer' }, order: { createdAt: 'DESC' }, take: 200 })
        : Promise.resolve([]),
      profile.role === 'admin'
        ? this.profiles.find({ where: { role: 'associate' }, order: { createdAt: 'DESC' } })
        : Promise.resolve([]),
      profile.role === 'admin' ? this.profiles.count() : Promise.resolve(0),
      profile.role === 'admin' ? this.orders.count() : Promise.resolve(orders.length),
    ]);

    const itemsByOrder = new Map<string, OrderItem[]>();
    for (const item of items) {
      itemsByOrder.set(item.orderId, [...(itemsByOrder.get(item.orderId) ?? []), item]);
    }
    const orderRows = orders.map((order) => ({
      ...order,
      items: itemsByOrder.get(order.id) ?? [],
    }));

    const sections = {
      customer: ['overview', 'purchase', 'orders', 'payments', 'profile'],
      associate: ['overview', 'customers', 'network', 'commission', 'leaderboard', 'rewards'],
      admin: ['overview', 'pricing', 'orders', 'products', 'associates'],
    } as const;
    const allowedSections = sections[profile.role];
    const section = allowedSections.some((allowed) => allowed === sectionQuery)
      ? sectionQuery ?? 'overview'
      : 'overview';

    response.render('dashboard', {
      csrfToken: request.cookies?.korviana_csrf ?? '',
      profile: this.auth.publicProfile(profile),
      section,
      saved: savedQuery === '1',
      created: createdQuery === '1',
      assigned: assignedQuery === '1',
      adminError: typeof errorQuery === 'string' ? errorQuery : '',
      pricing,
      products,
      orders: orderRows,
      payments,
      installments,
      commissions,
      customers,
      customerProfiles,
      associates,
      profileCount,
      orderCount,
    });
  }

  private loadOrders(profile: Profile): Promise<OrderEntity[]> {
    if (profile.role === 'admin') {
      return this.orders.find({ order: { createdAt: 'DESC' }, take: 100 });
    }
    if (profile.role === 'associate') {
      return this.orders.find({
        where: { associateId: profile.id },
        order: { createdAt: 'DESC' },
        take: 100,
      });
    }
    return this.orders.find({
      where: { customerId: profile.id },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }
}
