import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { Installment } from '../database/entities/installment.entity';
import { OrderEntity } from '../database/entities/order.entity';
import { OrderItem } from '../database/entities/order-item.entity';
import { Payment } from '../database/entities/payment.entity';
import { Product } from '../database/entities/product.entity';
import { Profile } from '../database/entities/profile.entity';
import { CheckoutItemDto } from './checkout.dto';
import { RazorpayService } from './razorpay.service';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(OrderEntity) private readonly orders: Repository<OrderEntity>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    private readonly dataSource: DataSource,
    private readonly razorpay: RazorpayService,
  ) {}

  async createOrder(
    customer: Profile,
    items: CheckoutItemDto[],
    expectedTotal?: number,
  ): Promise<{
    keyId: string;
    razorpayOrderId: string;
    amount: number;
    currency: string;
    orderId: string;
    orderNumber: string;
    totalAmount: number;
  }> {
    const skuSet = new Set(items.map((item) => item.sku));
    if (skuSet.size !== items.length) {
      throw new BadRequestException('Combine duplicate products into a single cart line.');
    }

    const products = await this.products.find({
      where: { sku: In([...skuSet]), active: true },
    });
    if (products.length !== skuSet.size) {
      throw new BadRequestException('One or more products are no longer available.');
    }

    const lines = items.map((item) => {
      const product = products.find((entry) => entry.sku === item.sku);
      if (!product) throw new BadRequestException('One or more products are no longer available.');
      const unitPricePaise = Math.round(Number(product.price) * 100);
      if (!Number.isSafeInteger(unitPricePaise) || unitPricePaise <= 0) {
        throw new BadRequestException('A product has an invalid price.');
      }
      return {
        product,
        quantity: item.quantity,
        unitPricePaise,
        lineTotalPaise: unitPricePaise * item.quantity,
      };
    });

    const totalPaise = lines.reduce((total, item) => total + item.lineTotalPaise, 0);
    if (!Number.isSafeInteger(totalPaise) || totalPaise <= 0) {
      throw new BadRequestException('The cart total is too large to process.');
    }
    if (expectedTotal !== undefined && Math.round(expectedTotal * 100) !== totalPaise) {
      throw new BadRequestException('Product prices changed. Refresh the catalogue and review your cart.');
    }

    const advancePaise = Math.round(totalPaise * 0.2);
    const order = await this.dataSource.transaction(async (manager) => {
      const firstProduct = lines[0].product;
      const orderRepository = manager.getRepository(OrderEntity);
      const savedOrder = await orderRepository.save(orderRepository.create({
        orderNumber: `PMP-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`,
        customerId: customer.id,
        associateId: customer.associateId,
        productId: firstProduct.id,
        totalAmount: (totalPaise / 100).toFixed(2),
        advanceAmount: (advancePaise / 100).toFixed(2),
        status: 'pending',
      }));

      const itemRepository = manager.getRepository(OrderItem);
      await itemRepository.save(lines.map(({ product, quantity, unitPricePaise, lineTotalPaise }) =>
        itemRepository.create({
          orderId: savedOrder.id,
          productId: product.id,
          sku: product.sku,
          metal: product.metal,
          purity: product.purity,
          weightGrams: product.weightGrams,
          quantity,
          unitPrice: (unitPricePaise / 100).toFixed(2),
          totalAmount: (lineTotalPaise / 100).toFixed(2),
        }),
      ));

      await manager.getRepository(Payment).save(manager.getRepository(Payment).create({
        orderId: savedOrder.id,
        customerId: customer.id,
        amount: (advancePaise / 100).toFixed(2),
        paymentMethod: 'online',
        providerReference: null,
        gatewayPaymentId: null,
        status: 'pending',
        paidAt: null,
      }));
      return savedOrder;
    });

    try {
      const gatewayOrder = await this.razorpay.createOrder(advancePaise, order.id);
      const payment = await this.payments.findOneByOrFail({ orderId: order.id });
      payment.providerReference = gatewayOrder.id;
      await this.payments.save(payment);
      return {
        keyId: this.razorpay.keyId,
        razorpayOrderId: gatewayOrder.id,
        amount: advancePaise,
        currency: 'INR',
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalAmount: totalPaise / 100,
      };
    } catch (error) {
      await this.dataSource.transaction(async (manager) => {
        await manager.getRepository(OrderEntity).update(order.id, { status: 'cancelled' });
        await manager.getRepository(Payment).update({ orderId: order.id }, { status: 'failed' });
      });
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException('Checkout could not be started. Please try again.', { cause: error });
    }
  }

  async verifyPayment(
    customer: Profile,
    orderId: string,
    paymentId: string,
    signature: string,
  ): Promise<{ orderNumber: string; totalAmount: number }> {
    const payment = await this.payments.findOne({
      where: { providerReference: orderId, customerId: customer.id },
    });
    if (!payment) throw new NotFoundException('Checkout order was not found.');

    if (payment.status === 'successful') {
      if (payment.gatewayPaymentId !== paymentId) {
        throw new BadRequestException('This payment does not match the recorded order.');
      }
      const existingOrder = await this.orders.findOneByOrFail({ id: payment.orderId });
      return {
        orderNumber: existingOrder.orderNumber,
        totalAmount: Number(existingOrder.totalAmount),
      };
    }
    if (payment.status !== 'pending') {
      throw new BadRequestException('This checkout is no longer pending.');
    }
    if (!(await this.razorpay.verifySignature(orderId, paymentId, signature))) {
      throw new BadRequestException('Payment verification failed.');
    }

    const amountPaise = Math.round(Number(payment.amount) * 100);
    let gatewayPayment = await this.razorpay.getPayment(paymentId);
    if (gatewayPayment.order_id !== orderId || gatewayPayment.amount !== amountPaise
      || gatewayPayment.currency !== 'INR') {
      throw new BadRequestException('Payment does not match this order.');
    }
    if (gatewayPayment.status === 'authorized') {
      gatewayPayment = await this.razorpay.capturePayment(paymentId, amountPaise);
    }
    if (gatewayPayment.status !== 'captured') {
      throw new BadRequestException('Payment has not been captured. Please try again.');
    }

    const order = await this.orders.findOneByOrFail({ id: payment.orderId });
    await this.dataSource.transaction(async (manager) => {
      const paymentRepository = manager.getRepository(Payment);
      payment.status = 'successful';
      payment.gatewayPaymentId = paymentId;
      payment.paidAt = new Date();
      await paymentRepository.save(payment);

      order.status = 'active';
      await manager.getRepository(OrderEntity).save(order);

      const remainingCents = Math.round((Number(order.totalAmount) - Number(order.advanceAmount)) * 100);
      const baseCents = Math.floor(remainingCents / 10);
      const installments = Array.from({ length: 10 }, (_, index) => {
        const dueDate = new Date();
        dueDate.setDate(18);
        dueDate.setMonth(dueDate.getMonth() + index + 1);
        const amountCents = index === 9
          ? remainingCents - baseCents * 9
          : baseCents;
        return manager.getRepository(Installment).create({
          orderId: order.id,
          installmentNumber: index + 1,
          dueDate: dueDate.toISOString().slice(0, 10),
          amount: (amountCents / 100).toFixed(2),
          paidAmount: '0.00',
          status: 'upcoming',
          paidAt: null,
        });
      });
      await manager.getRepository(Installment).save(installments);
    });

    return { orderNumber: order.orderNumber, totalAmount: Number(order.totalAmount) };
  }
}
