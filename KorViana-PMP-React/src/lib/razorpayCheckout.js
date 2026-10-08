import { supabase } from './supabaseClient';

let scriptPromise;

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Razorpay checkout could not be loaded.'));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export async function payWithRazorpay(sku) {
  const { data: order, error } = await supabase.functions.invoke('razorpay-payments', {
    body: { action: 'create', sku },
  });
  if (error) throw new Error(order?.error || error.message || 'Could not start checkout.');

  await loadRazorpay();
  if (!order?.keyId || !order?.razorpayOrderId) throw new Error('Razorpay is not configured correctly.');

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
    };

    const checkout = new window.Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: 'KorViana Precious Metal Program',
      description: `Advance payment for ${sku}`,
      order_id: order.razorpayOrderId,
      handler: async (response) => {
        const { data: verified, error: verifyError } = await supabase.functions.invoke('razorpay-payments', {
          body: { action: 'verify', ...response },
        });
        if (verifyError) {
          finish(reject, new Error(verified?.error || verifyError.message || 'Payment verification failed.'));
          return;
        }
        finish(resolve, { ...order, ...verified });
      },
      modal: { ondismiss: () => finish(reject, new Error('Payment was cancelled.')) },
    });

    checkout.on('payment.failed', (event) => {
      finish(reject, new Error(event.error?.description || 'Payment failed. Please try again.'));
    });
    checkout.open();
  });
}