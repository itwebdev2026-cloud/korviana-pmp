import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const razorpayRequest = async (path: string, method: string, body?: unknown) => {
  const keyId = Deno.env.get("RAZORPAY_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!keyId || !keySecret) throw new Error("Razorpay is not configured on the server.");

  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error?.description || "Razorpay request failed.");
  }
  return result;
};

const createPaymentOrder = async (admin: ReturnType<typeof createClient>, userId: string, sku: string) => {
  const { data: product, error: productError } = await admin
    .from("products")
    .select("id, sku, price, active")
    .eq("sku", sku)
    .eq("active", true)
    .single();

  if (productError || !product) throw new Error("This product is not available for checkout.");

  const totalPaise = Math.round(Number(product.price) * 100);
  const advancePaise = Math.round(totalPaise * 0.2);
  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      customer_id: userId,
      product_id: product.id,
      total_amount: totalPaise / 100,
      advance_amount: advancePaise / 100,
      status: "pending",
    })
    .select("id, order_number")
    .single();

  if (orderError || !order) throw new Error("Could not create your order.");

  try {
    const razorpayOrder = await razorpayRequest("/orders", "POST", {
      amount: advancePaise,
      currency: "INR",
      receipt: order.id,
      notes: { supabase_order_id: order.id, sku },
    });

    const { error: paymentError } = await admin.from("payments").insert({
      order_id: order.id,
      customer_id: userId,
      amount: advancePaise / 100,
      payment_method: "online",
      provider_reference: razorpayOrder.id,
      status: "pending",
    });

    if (paymentError) throw new Error("Could not record the payment attempt.");

    return {
      keyId: Deno.env.get("RAZORPAY_KEY_ID"),
      razorpayOrderId: razorpayOrder.id,
      amount: advancePaise,
      currency: "INR",
      orderId: order.id,
      orderNumber: order.order_number,
    };
  } catch (error) {
    await admin.from("orders").update({ status: "cancelled" }).eq("id", order.id);
    throw error;
  }
};

const verifySignature = async (orderId: string, paymentId: string, signature: string) => {
  const secret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (!secret || !/^[a-f\d]{64}$/i.test(signature)) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${orderId}|${paymentId}`),
  );
  const expected = Array.from(new Uint8Array(signed), (byte) => byte.toString(16).padStart(2, "0")).join("");
  let mismatch = expected.length ^ signature.length;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ (signature.toLowerCase().charCodeAt(index) || 0);
  }
  return mismatch === 0;
};

const recordSuccessfulPayment = async (
  admin: ReturnType<typeof createClient>,
  payment: { id: string; amount: number; order_id: string; provider_reference: string },
  gatewayPaymentId: string,
) => {
  const amountPaise = Math.round(Number(payment.amount) * 100);
  let gatewayPayment = await razorpayRequest(`/payments/${gatewayPaymentId}`, "GET");

  if (gatewayPayment.order_id !== payment.provider_reference) {
    throw new Error("Payment does not match this order.");
  }
  if (gatewayPayment.amount !== amountPaise || gatewayPayment.currency !== "INR") {
    throw new Error("Payment amount does not match this order.");
  }
  if (gatewayPayment.status === "authorized") {
    gatewayPayment = await razorpayRequest(`/payments/${gatewayPaymentId}/capture`, "POST", {
      amount: amountPaise,
      currency: "INR",
    });
  }
  if (gatewayPayment.status !== "captured") {
    throw new Error("Payment has not been captured. Please try again or contact support.");
  }

  const paidAt = new Date().toISOString();
  const { error: paymentUpdateError } = await admin
    .from("payments")
    .update({ status: "successful", paid_at: paidAt })
    .eq("id", payment.id);
  if (paymentUpdateError) throw new Error("Payment was captured but could not be recorded. Contact support.");

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("id, order_number, total_amount, advance_amount")
    .eq("id", payment.order_id)
    .single();
  if (orderError || !order) throw new Error("Payment was captured but the order could not be loaded.");

  const { error: orderUpdateError } = await admin
    .from("orders")
    .update({ status: "active" })
    .eq("id", order.id);
  if (orderUpdateError) throw new Error("Payment was captured but the order status could not be updated.");

  const { data: existingInstallments, error: installmentReadError } = await admin
    .from("installments")
    .select("id")
    .eq("order_id", order.id)
    .limit(1);
  if (installmentReadError) throw new Error("Payment was recorded but the schedule could not be checked.");

  if (!existingInstallments?.length) {
    const totalPaise = Math.round(Number(order.total_amount) * 100);
    const advancePaise = Math.round(Number(order.advance_amount) * 100);
    const balancePaise = totalPaise - advancePaise;
    const standardInstallmentPaise = Math.floor(balancePaise / 10);
    const now = new Date();
    const installments = Array.from({ length: 10 }, (_, index) => {
      const dueDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + index + 1, 1));
      const installmentPaise = index === 9
        ? balancePaise - standardInstallmentPaise * 9
        : standardInstallmentPaise;
      return {
        order_id: order.id,
        installment_number: index + 1,
        due_date: dueDate.toISOString().slice(0, 10),
        amount: installmentPaise / 100,
        status: "upcoming",
      };
    });
    const { error: installmentError } = await admin.from("installments").insert(installments);
    if (installmentError) throw new Error("Payment was recorded but the schedule could not be created.");
  }

  return { orderNumber: order.order_number, status: "successful" };
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!token || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Sign in is required before checkout." }, 401);
  }

  try {
    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) return json({ error: "Your session expired. Sign in and try again." }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if (profileError || profile?.role !== "customer") {
      return json({ error: "Only customer accounts can make purchases." }, 403);
    }

    const body = await request.json();
    if (body.action === "create") {
      if (typeof body.sku !== "string") return json({ error: "A product is required." }, 400);
      const result = await createPaymentOrder(admin, user.id, body.sku);
      return json(result);
    }

    if (body.action === "verify") {
      const { razorpay_order_id: razorpayOrderId, razorpay_payment_id: razorpayPaymentId, razorpay_signature: signature } = body;
      if (![razorpayOrderId, razorpayPaymentId, signature].every((value) => typeof value === "string")) {
        return json({ error: "Payment verification details are incomplete." }, 400);
      }
      if (!await verifySignature(razorpayOrderId, razorpayPaymentId, signature)) {
        return json({ error: "Payment signature could not be verified." }, 400);
      }

      const { data: payment, error: paymentError } = await admin
        .from("payments")
        .select("id, amount, order_id, provider_reference")
        .eq("provider_reference", razorpayOrderId)
        .eq("customer_id", user.id)
        .single();
      if (paymentError || !payment) return json({ error: "Payment does not belong to this account." }, 403);

      return json(await recordSuccessfulPayment(admin, payment, razorpayPaymentId));
    }

    return json({ error: "Unknown payment action." }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Payment could not be processed." }, 400);
  }
});