import Stripe from "stripe";
import {
  getCanonicalAppUrl,
  isProductionEnvironment,
  serverEnv,
} from "@/lib/env";

export const isStripeConfigured =
  !!serverEnv.STRIPE_SECRET_KEY &&
  !serverEnv.STRIPE_SECRET_KEY.startsWith("your_");

export const stripe = new Stripe(serverEnv.STRIPE_SECRET_KEY || "placeholder", {
  apiVersion: "2026-02-25.clover",
});

export const PRICE_ID = serverEnv.STRIPE_PRICE_ID || "";
export const SUBSCRIPTION_PRICE = 997; // $9.97 in cents
export const isStripeWebhookConfigured =
  !!serverEnv.STRIPE_WEBHOOK_SECRET &&
  !serverEnv.STRIPE_WEBHOOK_SECRET.startsWith("whsec_placeholder");

export function getStripeAppUrl(request?: Request) {
  const configured = getCanonicalAppUrl();
  if (configured) {
    return configured;
  }

  if (request && !isProductionEnvironment()) {
    return new URL(request.url).origin;
  }

  if (isProductionEnvironment()) {
    throw new Error("NEXT_PUBLIC_APP_URL is required in production");
  }

  return "http://localhost:3000";
}

export function getSubscriptionLineItems(): Stripe.Checkout.SessionCreateParams.LineItem[] {
  if (PRICE_ID) {
    return [
      {
        price: PRICE_ID,
        quantity: 1,
      },
    ];
  }

  if (isProductionEnvironment()) {
    throw new Error("STRIPE_PRICE_ID is required in production");
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
