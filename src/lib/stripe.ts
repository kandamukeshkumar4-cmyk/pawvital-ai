import Stripe from "stripe";

export const isStripeConfigured =
  !!process.env.STRIPE_SECRET_KEY &&
  !process.env.STRIPE_SECRET_KEY.startsWith("your_");

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "placeholder", {
  apiVersion: "2026-02-25.clover",
});

export const PRICE_ID = process.env.STRIPE_PRICE_ID || "price_pawvital_monthly";
export const SUBSCRIPTION_PRICE = 997; // $9.97 in cents
export const isStripeWebhookConfigured =
  !!process.env.STRIPE_WEBHOOK_SECRET &&
  !process.env.STRIPE_WEBHOOK_SECRET.startsWith("whsec_placeholder");

export function getStripeAppUrl(request?: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured && /^https?:\/\//.test(configured)) {
    return configured.replace(/\/$/, "");
  }

  if (request) {
    return new URL(request.url).origin;
  }

  return "http://localhost:3000";
}

export function getSubscriptionLineItems(): Stripe.Checkout.SessionCreateParams.LineItem[] {
  if (PRICE_ID && PRICE_ID !== "price_pawvital_monthly") {
    return [
      {
        price: PRICE_ID,
        quantity: 1,
      },
    ];
  }

  return [
    {
      price_data: {
        currency: "usd",
        product_data: {
          name: "PawVital AI Pro",
          description: "AI Pet Wellness Companion - Monthly Subscription",
        },
        unit_amount: SUBSCRIPTION_PRICE,
        recurring: {
          interval: "month",
        },
      },
      quantity: 1,
    },
  ];
}
