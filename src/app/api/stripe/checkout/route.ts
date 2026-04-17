import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  getStripeAppUrl,
  getSubscriptionLineItems,
  isStripeConfigured,
  stripe,
} from "@/lib/stripe";
import { blocksAdditionalCheckout } from "@/lib/subscription-state";
import { enforceRateLimit, enforceTrustedOrigin } from "@/lib/api-route";

interface ProfileSnapshot {
  email: string | null;
  full_name: string | null;
  stripe_customer_id: string | null;
}

interface SubscriptionSnapshot {
  current_period_end: string | null;
  plan: string;
  status: string;
  updated_at: string;
}

async function getCheckoutIdentity() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      error: NextResponse.json(
        { error: "Authentication required before checkout", code: "AUTH_REQUIRED" },
        { status: 401 }
      ),
      supabase,
      user: null,
    };
  }

  return { error: null, supabase, user };
}

async function loadProfileSnapshot(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("email, full_name, stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`PROFILE_LOOKUP_FAILED:${error.message}`);
  }

  return (data ?? null) as ProfileSnapshot | null;
}

async function loadLatestSubscription(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string
) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("status, plan, current_period_end, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`SUBSCRIPTION_LOOKUP_FAILED:${error.message}`);
  }

  return (data ?? null) as SubscriptionSnapshot | null;
}

async function hasBlockingSubscription(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string
) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["active", "trialing", "past_due", "unpaid"])
    .limit(1);

  if (error) {
    throw new Error(`SUBSCRIPTION_BLOCK_LOOKUP_FAILED:${error.message}`);
  }

  return (data?.length ?? 0) > 0;
}

async function persistStripeCustomerId(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  stripeCustomerId: string
) {
  const { error } = await supabase
    .from("profiles")
    .update({
      stripe_customer_id: stripeCustomerId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    throw new Error(`PROFILE_UPDATE_FAILED:${error.message}`);
  }
}

async function resolveStripeCustomerId(input: {
  existingCustomerId: string | null;
  email: string;
  fullName: string | null;
  userId: string;
}) {
  if (input.existingCustomerId) {
    await stripe.customers.update(input.existingCustomerId, {
      email: input.email,
      metadata: {
        userId: input.userId,
      },
      name: input.fullName ?? undefined,
    });

    return input.existingCustomerId;
  }

  const existingCustomers = await stripe.customers.list({
    email: input.email,
    limit: 10,
  });

  const matched = existingCustomers.data.find((customer) => {
    return customer.metadata?.userId === input.userId;
  });

  if (matched) {
    await stripe.customers.update(matched.id, {
      metadata: {
        userId: input.userId,
      },
      name: input.fullName ?? matched.name ?? undefined,
    });

    return matched.id;
  }

  const customer = await stripe.customers.create({
    email: input.email,
    metadata: {
      userId: input.userId,
    },
    name: input.fullName ?? undefined,
  });

  return customer.id;
}

export async function POST(request: Request) {
  const trustedOriginError = enforceTrustedOrigin(request);
  if (trustedOriginError) {
    return trustedOriginError;
  }

  const rateLimitError = await enforceRateLimit(request);
  if (rateLimitError) {
    return rateLimitError;
  }

  if (!isStripeConfigured) {
    return NextResponse.json(
      { error: "Stripe checkout is not configured", code: "STRIPE_NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  try {
    const identity = await getCheckoutIdentity();
    if (identity.error) {
      return identity.error;
    }

    const { supabase, user } = identity;
    const profile = await loadProfileSnapshot(supabase, user.id);
    const latestSubscription = await loadLatestSubscription(supabase, user.id);
    const hasBlocking = await hasBlockingSubscription(supabase, user.id);
    const blockingSubscription =
      latestSubscription && blocksAdditionalCheckout(latestSubscription.status)
        ? latestSubscription
        : null;

    if (hasBlocking || blockingSubscription) {
      return NextResponse.json(
        {
          current_period_end: blockingSubscription?.current_period_end ?? null,
          error: "An active or recoverable subscription already exists for this account.",
          plan: blockingSubscription?.plan ?? "pro",
          status: blockingSubscription?.status ?? "active",
          code: "ALREADY_SUBSCRIBED",
        },
        { status: 409 }
      );
    }

    const email = user.email ?? profile?.email ?? null;
    if (!email) {
      return NextResponse.json(
        {
          error: "A verified account email is required before checkout.",
          code: "EMAIL_REQUIRED",
        },
        { status: 400 }
      );
    }

    const stripeCustomerId = await resolveStripeCustomerId({
      existingCustomerId: profile?.stripe_customer_id ?? null,
      email,
      fullName: profile?.full_name ?? null,
      userId: user.id,
    });

    if (stripeCustomerId !== profile?.stripe_customer_id) {
      await persistStripeCustomerId(supabase, user.id, stripeCustomerId);
    }

    const appUrl = getStripeAppUrl(request);
    const idempotencyKey = createHash("sha256")
      .update(
        JSON.stringify({
          customer: stripeCustomerId,
          latestSubscriptionUpdatedAt: latestSubscription?.updated_at ?? "none",
          userId: user.id,
        })
      )
      .digest("hex");
    const session = await stripe.checkout.sessions.create({
      allow_promotion_codes: true,
      cancel_url: `${appUrl}/pricing`,
      client_reference_id: user.id,
      customer: stripeCustomerId,
      line_items: getSubscriptionLineItems(),
      metadata: {
        userEmail: email,
        userId: user.id,
      },
      mode: "subscription",
      subscription_data: {
        metadata: {
          userEmail: email,
          userId: user.id,
        },
        trial_period_days: 7,
      },
      success_url: `${appUrl}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
    }, { idempotencyKey });

    if (!session.url) {
      throw new Error("CHECKOUT_URL_MISSING");
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    if (error instanceof Error && error.message === "DEMO_MODE") {
      return NextResponse.json(
        {
          error: "Stripe checkout requires a configured account backend.",
          code: "DEMO_MODE",
        },
        { status: 503 }
      );
    }

    console.error("Stripe checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session", code: "CHECKOUT_CREATE_FAILED" },
      { status: 500 }
    );
  }
}
