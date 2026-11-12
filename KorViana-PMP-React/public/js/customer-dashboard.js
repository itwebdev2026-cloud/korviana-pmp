(() => {
  const root = document.querySelector('#customer-shop');
  const list = document.querySelector('#cart-items');
  const totalLabel = document.querySelector('#cart-total');
  const checkoutButton = document.querySelector('#checkout-button');
  const message = document.querySelector('#checkout-message');
  if (!root || !list || !totalLabel || !checkoutButton || !message) return;

  const cart = new Map();
  const money = (amount) => `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  const csrfToken = window.korvianaCsrfToken;

  function renderCart() {
    list.replaceChildren();
    const items = [...cart.values()];
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    totalLabel.textContent = money(total);
    checkoutButton.disabled = items.length === 0;

    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'py-3 text-sm text-muted';
      empty.textContent = 'Your cart is empty.';
      list.append(empty);
      return;
    }

    for (const item of items) {
      const row = document.createElement('div');
      row.className = 'flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between';
      const detail = document.createElement('div');
      const name = document.createElement('p');
      name.className = 'font-semibold capitalize';
      name.textContent = `${item.weight >= 1000 ? `${item.weight / 1000} kg` : `${item.weight} g`} ${item.metal}`;
      const price = document.createElement('p');
      price.className = 'mt-1 text-sm text-muted';
      price.textContent = `${money(item.price)} each · ${money(item.price * item.quantity)} total`;
      detail.append(name, price);

      const controls = document.createElement('div');
      controls.className = 'flex items-center gap-2';
      const quantity = document.createElement('span');
      quantity.className = 'min-w-8 text-center text-sm font-semibold';
      quantity.textContent = String(item.quantity);
      const decrease = makeButton('−', 'Decrease quantity');
      decrease.addEventListener('click', () => changeQuantity(item.sku, -1));
      const increase = makeButton('+', 'Increase quantity');
      increase.disabled = item.quantity >= 99;
      increase.addEventListener('click', () => changeQuantity(item.sku, 1));
      const remove = makeButton('Remove', `Remove ${name.textContent}`);
      remove.className = 'ml-2 min-h-11 px-2 text-sm font-semibold text-red-700';
      remove.addEventListener('click', () => {
        cart.delete(item.sku);
        renderCart();
      });
      controls.append(decrease, quantity, increase, remove);
      row.append(detail, controls);
      list.append(row);
    }
  }

  function makeButton(text, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'min-h-11 min-w-11 rounded-full border border-hair px-3 text-sm font-semibold hover:bg-bone disabled:opacity-50';
    button.textContent = text;
    button.setAttribute('aria-label', label);
    return button;
  }

  function changeQuantity(sku, amount) {
    const item = cart.get(sku);
    if (!item) return;
    const next = item.quantity + amount;
    if (next <= 0) cart.delete(sku);
    else item.quantity = Math.min(next, 99);
    renderCart();
  }

  document.querySelectorAll('[data-add-product]').forEach((button) => {
    button.addEventListener('click', () => {
      const sku = button.dataset.sku;
      if (!sku) return;
      const current = cart.get(sku);
      if (current) current.quantity = Math.min(current.quantity + 1, 99);
      else {
        cart.set(sku, {
          sku,
          metal: button.dataset.metal || '',
          weight: Number(button.dataset.weight),
          price: Number(button.dataset.price),
          quantity: 1,
        });
      }
      message.textContent = '';
      renderCart();
    });
  });

  checkoutButton.addEventListener('click', async () => {
    const items = [...cart.values()].map(({ sku, quantity }) => ({ sku, quantity }));
    const expectedTotal = [...cart.values()].reduce((sum, item) => sum + item.price * item.quantity, 0);
    checkoutButton.disabled = true;
    message.textContent = 'Preparing secure checkout…';

    try {
      const response = await fetch('/api/payments/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ items, expectedTotal }),
      });
      const checkout = await response.json();
      if (!response.ok) throw new Error(checkout.message || 'Checkout could not be started.');
      if (typeof window.Razorpay !== 'function') {
        throw new Error('Secure checkout could not load. Check your connection and try again.');
      }

      const razorpay = new window.Razorpay({
        key: checkout.keyId,
        amount: checkout.amount,
        currency: checkout.currency,
        name: 'KorViana Ventures LLP',
        description: `20% advance · ${checkout.orderNumber}`,
        order_id: checkout.razorpayOrderId,
        prefill: {
          name: root.dataset.customerName,
          email: root.dataset.customerEmail,
          contact: root.dataset.customerPhone,
        },
        notes: { order_number: checkout.orderNumber },
        theme: { color: '#17314E' },
        handler: async (result) => {
          message.textContent = 'Verifying your payment…';
          try {
            const verification = await fetch('/api/payments/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
              body: JSON.stringify(result),
            });
            const verified = await verification.json();
            if (!verification.ok) {
              throw new Error(verified.message || 'Payment was received but could not be verified.');
            }
            cart.clear();
            window.location.assign('/dashboard?section=orders');
          } catch (error) {
            message.textContent = error instanceof Error
              ? `${error.message} If payment was deducted, contact support with order ${checkout.orderNumber}.`
              : `Payment verification failed. Contact support with order ${checkout.orderNumber}.`;
          } finally {
            checkoutButton.disabled = cart.size === 0;
          }
        },
        modal: {
          ondismiss: () => {
            message.textContent = 'Checkout closed. Your cart is still available.';
            checkoutButton.disabled = cart.size === 0;
          },
        },
      });
      razorpay.on('payment.failed', (event) => {
        message.textContent = event.error?.description || 'Payment failed. Please try again.';
        checkoutButton.disabled = cart.size === 0;
      });
      razorpay.open();
      message.textContent = '';
    } catch (error) {
      message.textContent = error instanceof Error ? error.message : 'Checkout could not be started.';
      checkoutButton.disabled = cart.size === 0;
    }
  });

  renderCart();
})();
