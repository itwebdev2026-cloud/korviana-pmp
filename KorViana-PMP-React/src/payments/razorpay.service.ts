import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
};

type RazorpayPayment = {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
};

@Injectable()
export class RazorpayService {
  constructor(private readonly config: ConfigService) {}

  get keyId(): string {
    const keyId = this.config.get<string>('RAZORPAY_KEY_ID');
    if (!keyId) throw new ServiceUnavailableException('Online checkout is not configured.');
    return keyId;
  }

  async createOrder(amount: number, receipt: string): Promise<RazorpayOrder> {
    return this.request<RazorpayOrder>('/orders', 'POST', {
      amount,
      currency: 'INR',
      receipt,
    });
  }

  async getPayment(paymentId: string): Promise<RazorpayPayment> {
    return this.request<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}`, 'GET');
  }

  async capturePayment(paymentId: string, amount: number): Promise<RazorpayPayment> {
    return this.request<RazorpayPayment>(`/payments/${encodeURIComponent(paymentId)}/capture`, 'POST', {
      amount,
      currency: 'INR',
    });
  }

  async verifySignature(orderId: string, paymentId: string, signature: string): Promise<boolean> {
    const secret = this.config.get<string>('RAZORPAY_KEY_SECRET');
    if (!secret) throw new ServiceUnavailableException('Online checkout is not configured.');
    const { createHmac, timingSafeEqual } = await import('node:crypto');
    const expected = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest();
    const provided = Buffer.from(signature, 'hex');
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  }

  private async request<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
    const keyId = this.config.get<string>('RAZORPAY_KEY_ID');
    const keySecret = this.config.get<string>('RAZORPAY_KEY_SECRET');
    if (!keyId || !keySecret) throw new ServiceUnavailableException('Online checkout is not configured.');

    let response: globalThis.Response;
    try {
      response = await fetch(`https://api.razorpay.com/v1${path}`, {
        method,
        headers: {
          Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      throw new BadGatewayException('Razorpay could not be reached. Please try again.', { cause: error });
    }

    const text = await response.text();
    let result: unknown;
    try {
      result = JSON.parse(text);
    } catch (error) {
      throw new BadGatewayException('Razorpay returned an invalid response.', { cause: error });
    }
    if (!response.ok) {
      const description = typeof result === 'object' && result !== null
        && 'error' in result && typeof result.error === 'object' && result.error !== null
        && 'description' in result.error && typeof result.error.description === 'string'
        ? result.error.description
        : 'Razorpay request failed.';
      throw new BadGatewayException(description);
    }
    return result as T;
  }
}
