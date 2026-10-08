# Razorpay Checkout

The checkout uses a Supabase Edge Function to create Razorpay orders, verify checkout signatures, capture payments, and update the order/payment records. Razorpay credentials are server secrets; do not add the key secret to the frontend or commit it.

## Setup

1. Apply `supabase/schema.sql` in the Supabase SQL Editor if this is a new project. Apply `supabase/migrations/20261008_razorpay_catalog_products.sql` in the SQL Editor as well. If your local and remote migration histories are already in sync, you can instead run:

   ```powershell
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

2. In Razorpay Dashboard, enable Test Mode and copy the test key ID and key secret. Add them as Supabase Edge Function secrets:

   ```powershell
   supabase secrets set RAZORPAY_KEY_ID=<test-key-id> RAZORPAY_KEY_SECRET=<test-key-secret>
   ```

3. Deploy the payment function:

   ```powershell
   supabase functions deploy razorpay-payments
   ```

4. Sign in with a customer account and test a checkout using Razorpay test credentials and test payment details. Demo login deliberately disables live checkout.

5. After testing, replace the Edge Function secrets with live-mode credentials and deploy the function again.

The browser receives only the Razorpay key ID. The Edge Function uses the secret key to create and capture gateway orders and verifies the signed checkout response before marking a payment successful.

## OTP Login Setup

- Enable the Email provider in Supabase Auth. The email OTP template must include `{{ .Token }}` because the login screen asks users to enter the code; a template containing only `{{ .ConfirmationURL }}` sends a link instead.
- Configure custom SMTP for reliable production delivery. Supabase's default email service is rate-limited and intended for testing.
- To allow mobile login, configure an SMS provider in Supabase Auth and enter phone numbers in international format, such as `+919876543210`.
- Apply `supabase/schema.sql` so the auth-user trigger creates each customer's profile. Associate and admin profiles must be provisioned with their role before those users request an OTP; only customer login can create a new user.