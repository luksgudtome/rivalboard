# PayPal Billing Setup (FREE / PRO)

Billing is disabled by default while the app is in testing mode. Set `NEXT_PUBLIC_BILLING_ENABLED="true"` before following the steps below.

This app is configured for:

- `FREE`: up to 1 tournament
- `PRO`: unlimited tournaments at `$5/month`

## 1. Environment variables

Add these to your `.env`:

```env
NEXT_PUBLIC_BILLING_ENABLED="true"
APP_BASE_URL="http://localhost:3000"
PAYPAL_ENV="sandbox"
PAYPAL_CLIENT_ID="..."
PAYPAL_CLIENT_SECRET="..."
PAYPAL_PLAN_ID="..."
PAYPAL_WEBHOOK_ID="..."
```

Use `PAYPAL_ENV="live"` in production.

## 2. Create PayPal product + plan

In your PayPal Business developer dashboard:

1. Create a product (for example: `Rivalboard Pro`).
2. Create a billing plan under that product:
: price `$5`, interval `monthly`.
3. Copy the plan ID into `PAYPAL_PLAN_ID`.

## 3. Create webhook

Create a webhook listener URL:

`https://<your-domain>/api/billing/paypal/webhook`

Subscribe to at least:

- `BILLING.SUBSCRIPTION.ACTIVATED`
- `BILLING.SUBSCRIPTION.RE-ACTIVATED`
- `BILLING.SUBSCRIPTION.UPDATED`
- `BILLING.SUBSCRIPTION.CANCELLED`
- `BILLING.SUBSCRIPTION.SUSPENDED`
- `BILLING.SUBSCRIPTION.EXPIRED`
- `PAYMENT.SALE.COMPLETED`

Copy the webhook ID into `PAYPAL_WEBHOOK_ID`.

## 4. Database sync

Run:

```bash
npx prisma db push
npx prisma generate
```

## 5. Test flow

1. Sign in and open `/account`.
2. Click `Upgrade to Pro ($5/month)`.
3. Complete sandbox checkout.
4. Confirm plan updates to `PRO` in account.
5. Create more than 1 tournament to verify unlimited access.

## 6. Production checklist

1. Set `PAYPAL_ENV="live"`.
2. Use your live PayPal app credentials.
3. Create a live plan and webhook.
4. Set `APP_BASE_URL` to your production domain.
