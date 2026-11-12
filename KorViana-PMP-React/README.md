# KorViana PMP

The application is served by NestJS with server-rendered EJS pages, a React and Zustand store-manager dashboard, a PostgreSQL database managed by TypeORM migrations, and a mobile-first Tailwind CSS build.

The former React/Vite frontend and hosted-backend integrations have been removed. React is bundled only for the store-manager dashboard; customer and associate pages remain server-rendered. Original CSV exports are retained under `data/legacy-export/`; they are not read by the application or imported automatically.

## Requirements

- Node.js 20 or later
- PostgreSQL 15 or later (or Docker Compose)
- Razorpay test credentials for online checkout

## Local setup

From this directory:

```powershell
Copy-Item .env.example .env
docker compose up -d postgres
npm install
```

Set a unique `JWT_SECRET` and administrator credentials in `.env`. Use a 12–72 byte administrator password. For example:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Paste the generated value into `JWT_SECRET`. Leave Razorpay keys empty to run the site without online checkout.

Start the application:

```powershell
npm run start:dev
```

Open `http://localhost:3000`. On the first successful database connection, TypeORM runs the initial schema migration. The app seeds the supported gold/silver denominations and starter reference rates; an admin account is created only when both `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set.

## Pages

- `/` — program landing page
- `/about.html` — KorViana information
- `/purchase.html` — email-only purchase request builder (not an order or payment)
- `/associates.html` — portal entry points
- `/login` — customer, associate, and admin sign-in
- `/dashboard` — React/Zustand store manager for admins; server-rendered portals for customers and associates

`npm run build` builds Tailwind CSS, bundles the React/Zustand admin dashboard, and compiles NestJS. The dashboard bundle is generated at `public/js/admin-dashboard.js`. Responsive classes use mobile-first defaults with `sm`, `md`, and `lg` breakpoints.

## Accounts and data

This deployment uses a new PostgreSQL database. Existing users, data, and passwords are not copied. Customers can create accounts from the sign-in page. Create the first admin through the environment variables before starting the app. Associate accounts must be provisioned by an administrator; do not make associate or admin registration public.

For production, run `npm run build` and then `npm run start:prod`. Deployments must set `NODE_ENV=production`, a strong `JWT_SECRET`, a PostgreSQL `DATABASE_URL`, and HTTPS. Configure the Razorpay keys only in the server environment. Do not commit `.env` or payment credentials.

## Deploying to Vercel

Import the repository into Vercel and set the project root directory to `KorViana-PMP-React`. The included Vercel configuration builds the NestJS application and routes requests through its serverless handler.

Create a hosted PostgreSQL database through a provider such as Neon, then configure these variables in the Vercel project before deploying:

- `DATABASE_URL` — the hosted database connection string
- `JWT_SECRET` — a unique random secret of at least 32 characters
- `NODE_ENV=production`
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` — optional; set both together to provision the initial administrator
- `DATABASE_SSL=true` — set if required by the database provider

Online checkout remains disabled unless the Razorpay server keys are configured. Never use the local `.env` database URL for a Vercel deployment.

See [PAYMENTS.md](./PAYMENTS.md) for checkout configuration and test steps.
