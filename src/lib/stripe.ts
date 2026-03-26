import Stripe from "stripe";

export const isStripeConfigured =
  !!process.env.STRIPE_SECRET_KEY &&
  !process.env.STRIPE_SECRET_KEY.startsWith("your_");

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "placeholder", {
  apiVersion: "2026-02-25.clover",
});

export const PRICE_ID = "price_pawvital_monthly"; // Replace with your actual Stripe price ID
export const SUBSCRIPTION_PRICE = 997; // $9.97 in cents
