import { NextResponse } from "next/server";
import { stripe, isStripeConfigured } from "@/lib/stripe";
import { getServiceSupabase } from "@/lib/supabase-admin";
import type { SubscriptionPlanTier } from "@/types";
import Stripe from "stripe";

function customerIdFromSubscription(sub: Stripe.Subscription): string | null {
  const c = sub.customer;
  if (typeof c === "string") return c;
  return c?.id ?? null;
}

async function resolvePlanTier(sub: Stripe.Subscription): Promise<SubscriptionPlanTier> {
  const item = sub.items.data[0];
  const price = item?.price;
  if (!price) return "pro";

  const pm = price.metadata?.plan;
  if (pm === "clinic" || pm === "pro") return pm;

  const product = price.product;
  if (product && typeof product !== "string" && "name" in product) {
    const name = (product.name || "").toLowerCase();
    if (name.includes("clinic")) return "clinic";
  }
  if (typeof product === "string") {
    try {
      const p = await stripe.products.retrieve(product);
      const name = (p.name || "").toLowerCase();
      if (name.includes("clinic")) return "clinic";
    } catch {
      /* ignore */
    }
  }
  return "pro";
}

async function resolveUserIdForSubscription(
  sub: Stripe.Subscription,
  metadataUserId?: string | null
): Promise<string | null> {
  if (metadataUserId) return metadataUserId;

  const supabase = getServiceSupabase();
  const customerId = customerIdFromSubscription(sub);
  if (!supabase || !customerId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (profile?.id) return profile.id as string;

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .limit(1)
    .maybeSingle();

  return (existing?.user_id as string) ?? null;
}

async function upsertSubscriptionRow(
  sub: Stripe.Subscription,
  userId: string
): Promise<void> {
  const supabase = getServiceSupabase();
  if (!supabase) {
    console.error("Stripe webhook: SUPABASE_SERVICE_ROLE_KEY not configured");
    return;
  }

  const plan = await resolvePlanTier(sub);
  const customerId = customerIdFromSubscription(sub);
  const periodEndTs = sub.items.data[0]?.current_period_end;
  const periodEnd =
    typeof periodEndTs === "number"
      ? new Date(periodEndTs * 1000).toISOString()
      : null;

  const { error } = await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      stripe_subscription_id: sub.id,
      stripe_customer_id: customerId,
      plan,
      status: sub.status,
      current_period_end: periodEnd,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" }
  );

  if (error) {
    console.error("Stripe webhook upsert subscriptions:", error.message);
  }
}

export async function POST(request: Request) {
  if (!isStripeConfigured) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 400 });
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (error) {
    console.error("Webhook signature verification failed:", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const subRef = session.subscription;
      const subId = typeof subRef === "string" ? subRef : subRef?.id;
      if (userId && subId) {
        const fullSub = await stripe.subscriptions.retrieve(subId, {
          expand: ["items.data.price.product"],
        });
        await upsertSubscriptionRow(fullSub, userId);
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = await resolveUserIdForSubscription(
        subscription,
        subscription.metadata?.userId
      );
      if (userId) {
        await upsertSubscriptionRow(subscription, userId);
      } else {
        console.warn(
          "customer.subscription.updated: could not resolve user_id",
          subscription.id
        );
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const supabase = getServiceSupabase();
      if (supabase) {
        const { error } = await supabase
          .from("subscriptions")
          .update({
            status: "canceled",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subscription.id);
        if (error) {
          console.error("Stripe webhook cancel subscription:", error.message);
        }
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      console.log(`Payment failed for invoice: ${invoice.id}`);
      break;
    }
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
