import { createRoot } from 'react-dom/client';
import { useEffect } from 'react';
import { create } from 'zustand';

const sections = ['overview', 'pricing', 'orders', 'products', 'associates'] as const;
type AdminSection = (typeof sections)[number];

type Product = {
  sku: string;
  metal: string;
  weightGrams: string | number;
  purity: string;
  price: string | number;
  active: boolean;
};

type Order = {
  id: string;
  orderNumber: string;
  customerId: string;
  totalAmount: string | number;
  advanceAmount: string | number;
  status: string;
};

type Profile = {
  id: string;
  fullName: string;
  email: string;
};

type DashboardData = {
  csrfToken: string;
  profile: { fullName: string; email: string };
  section: string;
  saved: boolean;
  created: boolean;
  assigned: boolean;
  adminError: string;
  pricing: {
    rates: { gold: number; silver: number };
    markups: { gold: Record<string, number>; silver: Record<string, number> };
  };
  products: Product[];
  orders: Order[];
  customerProfiles: Profile[];
  associates: Profile[];
  profileCount: number;
  orderCount: number;
};

type DashboardStore = {
  section: AdminSection;
  orderSearch: string;
  productSearch: string;
  setSection: (section: AdminSection) => void;
  setOrderSearch: (search: string) => void;
  setProductSearch: (search: string) => void;
};

const useDashboardStore = create<DashboardStore>((set) => ({
  section: 'overview',
  orderSearch: '',
  productSearch: '',
  setSection: (section) => set({ section }),
  setOrderSearch: (orderSearch) => set({ orderSearch }),
  setProductSearch: (productSearch) => set({ productSearch }),
}));

const isAdminSection = (section: string): section is AdminSection =>
  (sections as readonly string[]).includes(section);

const formatMoney = (value: string | number): string =>
  Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const formatWeight = (value: string | number): string => {
  const grams = Number(value);
  return grams >= 1000 ? `${grams / 1000} kg` : `${grams} g`;
};

function Notice({ children, tone }: { children: string; tone: 'success' | 'error' }) {
  const style = tone === 'error'
    ? 'border-red-200 bg-red-50 text-red-800'
    : 'border-green-200 bg-green-50 text-green-900';
  return <p className={`mt-4 rounded-lg border p-3 text-sm ${style}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</p>;
}

function Overview({ data, onNavigate }: { data: DashboardData; onNavigate: (section: AdminSection) => void }) {
  const stats = [
    ['Profiles', data.profileCount],
    ['Associates', data.associates.length],
    ['Orders', data.orderCount],
    ['Active products', data.products.length],
  ];

  return (
    <>
      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(([label, value]) => (
          <article className="surface p-5" key={label}>
            <p className="text-sm text-muted">{label}</p>
            <p className="mt-2 font-display text-3xl">{value}</p>
          </article>
        ))}
      </section>
      <section className="surface mt-5 p-5 sm:p-7">
        <h2 className="font-display text-2xl">Store manager</h2>
        <p className="mt-3 text-sm leading-6 text-muted">Manage metal rates, catalogue prices, orders, and associate accounts.</p>
        <button className="btn-primary mt-5" type="button" onClick={() => onNavigate('pricing')}>Manage pricing</button>
      </section>
    </>
  );
}

function Pricing({ data }: { data: DashboardData }) {
  const goldWeights = [1, 2, 5, 10, 50, 100];
  const silverWeights = [50, 100, 200, 500, 1000];

  return (
    <section className="surface mt-6 p-5 sm:p-7">
      <p className="text-xs font-bold tracking-[.16em] text-gold-deep">STORE PRICING</p>
      <h2 className="mt-2 font-display text-2xl">Reference rates and denomination markups</h2>
      <p className="mt-2 text-sm leading-6 text-muted">Saving recalculates catalogue prices for future checkouts. Existing orders keep their stored checkout prices.</p>
      <form className="mt-6" action="/admin/pricing" method="post">
        <input type="hidden" name="_csrf" value={data.csrfToken} />
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold" htmlFor="gold-rate">Gold per 10 grams (₹)
            <input className="field mt-2" id="gold-rate" name="goldRate" type="number" min="0.01" step="0.01" defaultValue={data.pricing.rates.gold} required />
          </label>
          <label className="text-sm font-semibold" htmlFor="silver-rate">Silver per kilogram (₹)
            <input className="field mt-2" id="silver-rate" name="silverRate" type="number" min="0.01" step="0.01" defaultValue={data.pricing.rates.silver} required />
          </label>
        </div>
        <h3 className="mt-7 font-display text-xl">Gold markups (%)</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {goldWeights.map((weight) => (
            <label className="text-xs font-semibold" htmlFor={`gold-markup-${weight}`} key={weight}>
              {weight} g
              <input className="field mt-1" id={`gold-markup-${weight}`} name={`goldMarkup${weight}`} type="number" min="0" max="100" step="0.01" defaultValue={data.pricing.markups.gold[String(weight)]} required />
            </label>
          ))}
        </div>
        <h3 className="mt-7 font-display text-xl">Silver markups (%)</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {silverWeights.map((weight) => (
            <label className="text-xs font-semibold" htmlFor={`silver-markup-${weight}`} key={weight}>
              {weight >= 1000 ? '1 kg' : `${weight} g`}
              <input className="field mt-1" id={`silver-markup-${weight}`} name={`silverMarkup${weight}`} type="number" min="0" max="100" step="0.01" defaultValue={data.pricing.markups.silver[String(weight)]} required />
            </label>
          ))}
        </div>
        <button className="btn-primary mt-7 w-full sm:w-auto" type="submit">Save rates and prices</button>
      </form>
    </section>
  );
}

function Orders({ orders }: { orders: Order[] }) {
  const search = useDashboardStore((state) => state.orderSearch);
  const setSearch = useDashboardStore((state) => state.setOrderSearch);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredOrders = orders.filter((order) =>
    [order.orderNumber, order.customerId, order.status]
      .some((value) => value.toLowerCase().includes(normalizedSearch)),
  );

  return (
    <section className="mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-bold tracking-[.16em] text-gold-deep">FULFILMENT</p><h2 className="mt-2 font-display text-2xl">Recent orders</h2></div>
        <label className="text-sm font-semibold">Search orders
          <input className="field mt-1 w-full sm:w-72" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Order, customer, or status" />
        </label>
      </div>
      {filteredOrders.length === 0
        ? <p className="surface mt-4 p-5 text-sm text-muted">{orders.length ? 'No orders match your search.' : 'No orders have been placed.'}</p>
        : <div className="table-wrap mt-4 rounded-xl border border-hair bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-bone text-xs text-muted"><tr><th className="p-3">Order</th><th className="p-3">Customer</th><th className="p-3">Total</th><th className="p-3">Advance</th><th className="p-3">Status</th></tr></thead>
            <tbody>{filteredOrders.map((order) => (
              <tr key={order.id}>
                <td className="border-t border-hair p-3">{order.orderNumber}</td>
                <td className="border-t border-hair p-3">{order.customerId}</td>
                <td className="border-t border-hair p-3">₹{formatMoney(order.totalAmount)}</td>
                <td className="border-t border-hair p-3">₹{formatMoney(order.advanceAmount)}</td>
                <td className="border-t border-hair p-3 capitalize">{order.status}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>}
    </section>
  );
}

function Products({ products }: { products: Product[] }) {
  const search = useDashboardStore((state) => state.productSearch);
  const setSearch = useDashboardStore((state) => state.setProductSearch);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredProducts = products.filter((product) =>
    [product.sku, product.metal, product.purity, formatWeight(product.weightGrams)]
      .some((value) => value.toLowerCase().includes(normalizedSearch)),
  );

  return (
    <section className="mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-bold tracking-[.16em] text-gold-deep">CATALOGUE</p><h2 className="mt-2 font-display text-2xl">Product catalogue</h2></div>
        <label className="text-sm font-semibold">Search products
          <input className="field mt-1 w-full sm:w-72" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="SKU, metal, weight, or purity" />
        </label>
      </div>
      {filteredProducts.length === 0
        ? <p className="surface mt-4 p-5 text-sm text-muted">{products.length ? 'No products match your search.' : 'No active products are available.'}</p>
        : <div className="table-wrap mt-4 rounded-xl border border-hair bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-bone text-xs text-muted"><tr><th className="p-3">SKU</th><th className="p-3">Metal</th><th className="p-3">Weight</th><th className="p-3">Purity</th><th className="p-3">Price</th><th className="p-3">Status</th></tr></thead>
            <tbody>{filteredProducts.map((product) => (
              <tr key={product.sku}>
                <td className="border-t border-hair p-3">{product.sku}</td>
                <td className="border-t border-hair p-3 capitalize">{product.metal}</td>
                <td className="border-t border-hair p-3">{formatWeight(product.weightGrams)}</td>
                <td className="border-t border-hair p-3">{product.purity}</td>
                <td className="border-t border-hair p-3">₹{formatMoney(product.price)}</td>
                <td className="border-t border-hair p-3">{product.active ? 'Active' : 'Inactive'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>}
    </section>
  );
}

function Associates({ data }: { data: DashboardData }) {
  return (
    <section className="mt-6">
      <div><p className="text-xs font-bold tracking-[.16em] text-gold-deep">TEAM</p><h2 className="mt-2 font-display text-2xl">Associate accounts</h2></div>
      {data.adminError && <Notice tone="error">{data.adminError}</Notice>}
      {data.created && <Notice tone="success">Associate account created. Share the temporary password securely.</Notice>}
      {data.assigned && <Notice tone="success">Customer assignment saved.</Notice>}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <form className="surface p-5" action="/admin/associates" method="post">
          <h3 className="font-display text-xl">Create an associate</h3>
          <p className="mt-2 text-xs leading-5 text-muted">Set a temporary password of at least 12 characters and share it out of band.</p>
          <input type="hidden" name="_csrf" value={data.csrfToken} />
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-semibold">Full name<input className="field mt-1" name="fullName" minLength={2} maxLength={160} required /></label>
            <label className="block text-sm font-semibold">Email<input className="field mt-1" name="email" type="email" maxLength={254} required /></label>
            <label className="block text-sm font-semibold">Phone (optional)<input className="field mt-1" name="phone" type="tel" maxLength={24} /></label>
            <label className="block text-sm font-semibold">Temporary password<input className="field mt-1" name="password" type="password" minLength={12} maxLength={72} autoComplete="new-password" required /></label>
            <button className="btn-primary w-full" type="submit">Create account</button>
          </div>
        </form>
        <form className="surface p-5" action="/admin/customers/assign" method="post">
          <h3 className="font-display text-xl">Assign a customer</h3>
          <p className="mt-2 text-xs leading-5 text-muted">Link a registered customer to one associate.</p>
          <input type="hidden" name="_csrf" value={data.csrfToken} />
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-semibold">Customer
              <select className="field mt-1" name="customerEmail" required>
                {data.customerProfiles.map((customer) => <option key={customer.id} value={customer.email}>{customer.fullName} · {customer.email}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold">Associate
              <select className="field mt-1" name="associateId" required>
                {data.associates.map((associate) => <option key={associate.id} value={associate.id}>{associate.fullName} · {associate.email}</option>)}
              </select>
            </label>
            <button className="btn-secondary w-full disabled:opacity-50" type="submit" disabled={!data.customerProfiles.length || !data.associates.length}>Assign customer</button>
          </div>
        </form>
      </div>
      {data.associates.length === 0
        ? <p className="surface mt-4 p-5 text-sm text-muted">No associate accounts have been created yet.</p>
        : <div className="mt-5 grid gap-3 sm:grid-cols-2">{data.associates.map((associate) => (
          <article className="surface p-4" key={associate.id}>
            <h3 className="font-semibold">{associate.fullName}</h3>
            <p className="mt-1 break-all text-sm text-muted">{associate.email}</p>
          </article>
        ))}</div>}
    </section>
  );
}

function AdminDashboard({ data }: { data: DashboardData }) {
  const section = useDashboardStore((state) => state.section);
  const setSection = useDashboardStore((state) => state.setSection);

  const navigate = (nextSection: AdminSection) => {
    setSection(nextSection);
    window.history.pushState({ section: nextSection }, '', `/dashboard?section=${nextSection}`);
  };

  useEffect(() => {
    const restoreSection = () => {
      const querySection = new URLSearchParams(window.location.search).get('section') ?? 'overview';
      setSection(isAdminSection(querySection) ? querySection : 'overview');
    };
    window.addEventListener('popstate', restoreSection);
    return () => window.removeEventListener('popstate', restoreSection);
  }, [setSection]);

  const labels: Record<AdminSection, string> = {
    overview: 'Overview',
    pricing: 'Pricing',
    orders: 'Orders',
    products: 'Products',
    associates: 'Associates',
  };

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-gold-deep">Store manager</p>
          <h1 className="mt-2 font-display text-3xl sm:text-4xl">Welcome, {data.profile.fullName}</h1>
          <p className="mt-1 text-sm text-muted">{data.profile.email}</p>
        </div>
        <form action="/auth/logout" method="post">
          <input type="hidden" name="_csrf" value={data.csrfToken} />
          <button className="btn-secondary w-full sm:w-auto" type="submit">Sign out</button>
        </form>
      </div>
      {data.saved && <Notice tone="success">Pricing and catalogue prices were updated.</Notice>}
      <nav className="mt-6 flex gap-2 overflow-x-auto border-b border-hair pb-3" aria-label="Store manager sections">
        {sections.map((key) => (
          <a
            aria-current={section === key ? 'page' : undefined}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${section === key ? 'bg-ink text-white' : 'bg-white text-muted hover:text-ink'}`}
            href={`/dashboard?section=${key}`}
            key={key}
            onClick={(event) => {
              event.preventDefault();
              navigate(key);
            }}
          >
            {labels[key]}
          </a>
        ))}
      </nav>
      <div>
        {section === 'overview' && <Overview data={data} onNavigate={navigate} />}
        {section === 'pricing' && <Pricing data={data} />}
        {section === 'orders' && <Orders orders={data.orders} />}
        {section === 'products' && <Products products={data.products} />}
        {section === 'associates' && <Associates data={data} />}
      </div>
    </>
  );
}

const rootElement = document.getElementById('admin-dashboard-root');
const dataElement = document.getElementById('admin-dashboard-data');

if (!(rootElement instanceof HTMLElement) || !(dataElement instanceof HTMLScriptElement)) {
  throw new Error('Store manager dashboard markup is missing.');
}

const data = JSON.parse(dataElement.textContent ?? '') as DashboardData;
useDashboardStore.setState({
  section: isAdminSection(data.section) ? data.section : 'overview',
});

createRoot(rootElement).render(<AdminDashboard data={data} />);
