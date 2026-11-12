# Razorpay checkout

The NestJS payment API creates Razorpay orders from server-side catalogue prices, verifies the signed checkout response, confirms the captured payment with Razorpay, and only then activates the order and creates ten monthly instalments. The browser never receives the Razorpay secret.

## Configure test mode

1. Start PostgreSQL and configure `DATABASE_URL` and `JWT_SECRET` as described in [README.md](./README.md).
2. In Razorpay Dashboard, enable Test Mode and copy the test key ID and key secret into the server `.env`:

   ```dotenv
   RAZORPAY_KEY_ID=rzp_test_...
   RAZORPAY_KEY_SECRET=...
   ```

3. Restart the NestJS app and sign in with a customer account. Add catalogue items and test checkout using Razorpay test payment details.
4. Verify that a successful payment creates an active order and ten instalment rows in PostgreSQL. Failed or cancelled checkouts must not activate orders.

The payable checkout amount is a 20% advance against the full cart. The server reloads active products and calculates prices from PostgreSQL; any total sent by the browser is only a stale-price check and is never trusted as the order amount.

## Production

- Use live-mode Razorpay credentials only in the production secret manager or environment.
- Serve the app over HTTPS and set `NODE_ENV=production`.
- Use a private PostgreSQL connection and a strong `JWT_SECRET`.
- Do not commit credentials or place `RAZORPAY_KEY_SECRET` in client-side code.

The separate `/purchase.html` page creates an email draft only. It is not a Razorpay checkout, order, or payment.
