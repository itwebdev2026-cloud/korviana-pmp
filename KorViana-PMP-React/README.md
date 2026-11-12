# KorViana PMP

The application is served by NestJS with server-rendered EJS pages, a PostgreSQL database managed by TypeORM migrations, and a mobile-first Tailwind CSS build.

The obsolete React/Vite frontend and hosted-backend integrations have been removed. Original CSV exports are retained under `data/legacy-export/`; they are not read by the application or imported automatically.

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
- `/dashboard` — role-specific server-rendered portal

Tailwind is built as part of `npm run build`; responsive classes use mobile-first defaults with `sm`, `md`, and `lg` breakpoints.

## Accounts and data

This deployment uses a new PostgreSQL database. Existing users, data, and passwords are not copied. Customers can create accounts from the sign-in page. Create the first admin through the environment variables before starting the app. Associate accounts must be provisioned by an administrator; do not make associate or admin registration public.

For production, run `npm run build` and then `npm run start:prod`. Deployments must set `NODE_ENV=production`, a strong `JWT_SECRET`, a PostgreSQL `DATABASE_URL`, and HTTPS. Configure the Razorpay keys only in the server environment. Do not commit `.env` or payment credentials.

See [PAYMENTS.md](./PAYMENTS.md) for checkout configuration and test steps.
