import { NextResponse } from "next/server";
import type Stripe from "stripe";
import type { SubscriptionPlanTier } from "@/types";
import { getServiceSupabase } from "@/lib/supabase-admin";
import {
  isStripeConfigured,
  isStripeWebhookConfigured,
  stripe,
} from "@/lib/stripe";
import { mapStripeStatusToProfileStatus } from "@/lib/subscription-state";

type ServiceSupabase = NonNullable<ReturnType<typeof getServiceSupabase>>;

function requireServiceSupabase(): ServiceSupabase {
  const supabase = getServiceSupabase();
  if (!supabase) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
  }

  return supabase;
}

function customerIdFromSubscription(sub: Stripe.Subscription): string | null {
  const customer = sub.customer;
  if (typeof customer === "string") {
    return customer;
  }

  return customer?.id ?? null;
}

function customerIdFromSession(session: Stripe.Checkout.Session): string | null {
  const customer = session.customer;
  if (typeof customer === "string") {
    return customer;
  }

  return customer?.id ?? null;
}

async function resolvePlanTier(sub: Stripe.Subscription): Promise<SubscriptionPlanTier> {
  const item = sub.items.data[0];
  const price = item?.price;
  if (!price) {
    return "pro";
  }

  const planMetadata = price.metadata?.plan;
  if (planMetadata === "clinic" || planMetadata === "pro") {
    return planMetadata;
  }

  const product = price.product;
  if (product && typeof product !== "string" && "name" in product) {
    const name = (product.name || "").toLowerCase();
    if (name.includes("clinic")) {
      return "clinic";
    }
  }

  if (typeof product === "string") {
    const retrieved = await stripe.products.retrieve(product);
    if ((retrieved.name || "").toLowerCase().includes("clinic")) {
      return "clinic";
    }
  }

  return "pro";
}

async function findProfileUserIdByCustomerId(
  supabase: ServiceSupabase,
  customerId: string
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (error) {
    throw new Error(`PROFILE_CUSTOMER_LOOKUP_FAILED:${error.message}`);
  }

  return (data?.id as string | undefined) ?? null;
}

async function findProfileUserIdByEmail(
  supabase: ServiceSupabase,
  email: string
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (error) {
    throw new Error(`PROFILE_EMAIL_LOOKUP_FAILED:${error.message}`);
  }

  return (data?.id as string | undefined) ?? null;
}

async function findSubscriptionUserIdByCustomerId(
  supabase: ServiceSupabase,
  customerId: string
) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`SUBSCRIPTION_CUSTOMER_LOOKUP_FAILED:${error.message}`);
  }

  return (data?.user_id as string | undefined) ?? null;
}

async function resolveCustomerEmail(customerId: string) {
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) {
    return null;
  }

  return customer.email?.toLowerCase() ?? null;
}

async function resolveUserIdForSession(
  supabase: ServiceSupabase,
  session: Stripe.Checkout.Session
) {
  const metadataUserId = session.metadata?.userId;
  if (metadataUserId) {
    return metadataUserId;
  }

  if (session.client_reference_id) {
    return session.client_reference_id;
  }

  const customerId = customerIdFromSession(session);
  if (customerId) {
    const byCustomer = await findProfileUserIdByCustomerId(supabase, customerId);
    if (byCustomer) {
      return byCustomer;
    }

    const bySubscription = await findSubscriptionUserIdByCustomerId(supabase, customerId);
    if (bySubscription) {
      return bySubscription;
    }

    const customerEmail = await resolveCustomerEmail(customerId);
    if (customerEmail) {
      return findProfileUserIdByEmail(supabase, customerEmail);
    }
  }

  const email =
    session.customer_details?.email?.toLowerCase() ??
    session.metadata?.userEmail?.toLowerCase() ??
    null;

  if (email) {
    return findProfileUserIdByEmail(supabase, email);
  }

  return null;
}

async function resolveUserIdForSubscription(
  supabase: ServiceSupabase,
  subscription: Stripe.Subscription
) {
  const metadataUserId = subscription.metadata?.userId;
  if (metadataUserId) {
    return metadataUserId;
  }

  const customerId = customerIdFromSubscription(subscription);
  if (!customerId) {
    return null;
  }

  const byCustomer = await findProfileUserIdByCustomerId(supabase, customerId);
  if (byCustomer) {
    return byCustomer;
  }

  const bySubscription = await findSubscriptionUserIdByCustomerId(supabase, customerId);
  if (bySubscription) {
    return bySubscription;
  }

  const customerEmail = await resolveCustomerEmail(customerId);
  if (customerEmail) {
    return findProfileUserIdByEmail(supabase, customerEmail);
  }

  return null;
}

async function updateProfileBillingState(input: {
  stripeCustomerId: string | null;
  subscriptionStatus: string;
  supabase: ServiceSupabase;
  userId: string;
}) {
  const { error } = await input.supabase
    .from("profiles")
    .update({
      stripe_customer_id: input.stripeCustomerId,
      subscription_status: mapStripeStatusToProfileStatus(input.subscriptionStatus),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.userId);

  if (error) {
    throw new Error(`PROFILE_BILLING_UPDATE_FAILED:${error.message}`);
  }
}

async function upsertSubscriptionState(input: {
  stripeSubscription: Stripe.Subscription;
  supabase: ServiceSupabase;
  userId: string;
}) {
  const plan = await resolvePlanTier(input.stripeSubscription);
  const customerId = customerIdFromSubscription(input.stripeSubscription);
  const currentPeriodEndRaw = input.stripeSubscription.current_period_end ?? null;
  const currentPeriodEnd =
    typeof currentPeriodEndRaw === "number"
      ? new Date(currentPeriodEndRaw * 1000).toISOString()
      : null;

  const { error } = await input.supabase.from("subscriptions").upsert(
    {
      current_period_end: currentPeriodEnd,
      plan,
      status: input.stripeSubscription.status,
      stripe_customer_id: customerId,
      stripe_subscription_id: input.stripeSubscription.id,
      updated_at: new Date().toISOString(),
      user_id: input.userId,
    },
    { onConflict: "stripe_subscription_id" }
  );

  if (error) {
    throw new Error(`SUBSCRIPTION_UPSERT_FAILED:${error.message}`);
  }

  await updateProfileBillingState({
    stripeCustomerId: customerId,
    subscriptionStatus: input.stripeSubscription.status,
    supabase: input.supabase,
    userId: input.userId,
  });
}

async function markSubscriptionCanceled(input: {
  stripeSubscription: Stripe.Subscription;
  supabase: ServiceSupabase;
  userId: string | null;
}) {
  const customerId = customerIdFromSubscription(input.stripeSubscription);

  const subscriptionUpdate = await input.supabase
    .from("subscriptions")
    .update({
      current_period_end: null,
      status: "canceled",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", input.stripeSubscription.id);

  if (subscriptionUpdate.error) {
    throw new Error(
      `SUBSCRIPTION_CANCEL_UPDATE_FAILED:${subscriptionUpdate.error.message}`
    );
  }

  if (input.userId) {
    await updateProfileBillingState({
      stripeCustomerId: customerId,
      subscriptionStatus: "canceled",
      supabase: input.supabase,
      userId: input.userId,
    });
    return;
  }

  if (customerId) {
    const profileUpdate = await input.supabase
      .from("profiles")
      .update({
        subscription_status: mapStripeStatusToProfileStatus("canceled"),
        updated_at: new Date().toISOString(),
      })
      .eq("stripe_customer_id", customerId);

    if (profileUpdate.error) {
      throw new Error(
        `PROFILE_CANCEL_UPDATE_FAILED:${profileUpdate.error.message}`
      );
    }
  }
}

export async function POST(request: Request) {
  if (!isStripeConfigured) {
    return NextResponse.json(
      { error: "Stripe is not configured", code: "STRIPE_NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  if (!isStripeWebhookConfigured) {
    return NextResponse.json(
      { error: "Stripe webhook secret is not configured", code: "WEBHOOK_NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const body = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (error) {
    console.error("Webhook signature verification failed:", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  try {
    const supabase = requireServiceSupabase();

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") {
          break;
        }

        const userId = await resolveUserIdForSession(supabase, session);
        const subscriptionRef = session.subscription;
        const subscriptionId =
          typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id;

        if (!userId || !subscriptionId) {
          console.warn(
            "checkout.session.completed: unable to resolve user or subscription",
            session.id
          );
          break;
        }

        const fullSubscription = await stripe.subscriptions.retrieve(subscriptionId, {
          expand: ["items.data.price.product"],
        });
        await upsertSubscriptionState({
          stripeSubscription: fullSubscription,
          supabase,
          userId,
        });
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = await resolveUserIdForSubscription(supabase, subscription);
        if (!userId) {
          console.warn(
            `${event.type}: could not resolve user_id for subscription`,
            subscription.id
          );
          break;
        }

        await upsertSubscriptionState({
          stripeSubscription: subscription,
          supabase,
          userId,
        });
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = await resolveUserIdForSubscription(supabase, subscription);
        await markSubscriptionCanceled({
          stripeSubscription: subscription,
          supabase,
          userId,
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        console.warn("Stripe invoice payment failed", invoice.id);
        break;
      }
    }
  } catch (error) {
    console.error("Stripe webhook persistence failed:", error);
    return NextResponse.json(
      { error: "Webhook persistence failed", code: "WEBHOOK_PERSISTENCE_FAILED" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
