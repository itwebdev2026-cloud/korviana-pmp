(() => {
  const root = document.querySelector('#request-app');
  if (!root) return;

  const products = JSON.parse(root.dataset.products || '[]');
  const form = document.querySelector('#request-form');
  const metalField = document.querySelector('#item-metal');
  const weightField = document.querySelector('#item-weight');
  const quantityField = document.querySelector('#item-quantity');
  const rows = document.querySelector('#request-items');
  const error = document.querySelector('#request-error');
  const status = document.querySelector('#request-status');
  const submitButton = document.querySelector('#submit-request');
  const count = document.querySelector('#request-count');
  const items = new Map();
  const money = (amount) => `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

  function formatWeight(grams) {
    return grams >= 1000 ? `${grams / 1000} kg` : `${grams} g`;
  }

  function updateWeights() {
    const options = products.filter((product) => product.metal === metalField.value);
    weightField.replaceChildren(...options.map((product) => {
      const option = document.createElement('option');
      option.value = product.sku;
      option.textContent = formatWeight(product.weight);
      return option;
    }));
    weightField.disabled = options.length === 0;
  }

  function renderItems() {
    rows.replaceChildren();
    const values = [...items.values()];
    if (values.length === 0) {
      const row = rows.insertRow();
      const cell = row.insertCell();
      cell.colSpan = 5;
      cell.className = 'p-4 text-muted';
      cell.textContent = 'No items added yet.';
      submitButton.disabled = true;
      count.textContent = '0 items';
      return;
    }

    values.forEach((item, index) => {
      const row = rows.insertRow();
      [String(index + 1).padStart(2, '0'), `${formatWeight(item.weight)} ${item.metal}`, String(item.quantity), money(item.price * item.quantity)].forEach((value) => {
        const cell = row.insertCell();
        cell.className = 'border-t border-hair p-3';
        cell.textContent = value;
      });
      const action = row.insertCell();
      action.className = 'border-t border-hair p-3';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'min-h-10 font-semibold text-red-700 hover:underline';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove ${formatWeight(item.weight)} ${item.metal}`);
      remove.addEventListener('click', () => {
        items.delete(item.sku);
        status.textContent = '';
        renderItems();
      });
      action.append(remove);
    });

    submitButton.disabled = false;
    const quantity = values.reduce((total, item) => total + item.quantity, 0);
    count.textContent = `${values.length} ${values.length === 1 ? 'item' : 'items'} · ${quantity} total`;
  }

  metalField.addEventListener('change', updateWeights);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    error.hidden = true;
    status.textContent = '';
    const product = products.find((entry) => entry.sku === weightField.value);
    const quantity = Number(quantityField.value);
    if (!product || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
      error.textContent = 'Choose a listed denomination and a quantity from 1 to 99.';
      error.hidden = false;
      return;
    }

    const current = items.get(product.sku);
    const nextQuantity = (current?.quantity ?? 0) + quantity;
    if (nextQuantity > 99) {
      error.textContent = 'Each item is limited to 99 units per request.';
      error.hidden = false;
      return;
    }
    items.set(product.sku, { ...product, quantity: nextQuantity });
    quantityField.value = '1';
    renderItems();
  });

  submitButton.addEventListener('click', () => {
    const lines = [...items.values()].map((item) =>
      `${item.quantity} × ${formatWeight(item.weight)} ${item.metal} — ${money(item.price * item.quantity)}`);
    const total = [...items.values()].reduce((sum, item) => sum + item.price * item.quantity, 0);
    const body = [
      'I would like to submit the following purchase request:',
      ...lines,
      '',
      `Different items: ${items.size}`,
      `Total quantity: ${[...items.values()].reduce((sum, item) => sum + item.quantity, 0)}`,
      `Estimated total: ${money(total)}`,
      '',
      'Please contact me to discuss this request. This email is a request only, not an order or payment.',
    ].join('\n');
    const subject = 'Purchase request from KorViana website';
    window.location.href = `mailto:korvianamail@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    status.textContent = 'Your email app should open with the request details. Send that email to complete your request.';
  });

  updateWeights();
  renderItems();
})();
