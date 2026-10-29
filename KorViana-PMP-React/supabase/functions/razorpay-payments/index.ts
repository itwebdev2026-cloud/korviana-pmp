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

type RequestedItem = { sku: string; quantity: number };

const createPaymentOrder = async (
  admin: ReturnType<typeof createClient>,
  userId: string,
  items: RequestedItem[],
  expectedTotal?: number,
) => {
  const { data: products, error: productError } = await admin
    .from("products")
    .select("id, sku, metal, purity, weight_grams, price")
    .in("sku", items.map((item) => item.sku))
    .eq("active", true);

  if (productError || !products || products.length !== items.length) {
    throw new Error("One or more products are no longer available for checkout.");
  }

  const orderLines = items.map((item) => {
    const product = products.find((candidate) => candidate.sku === item.sku);
    if (!product) throw new Error("One or more products are no longer available for checkout.");
    const unitPricePaise = Math.round(Number(product.price) * 100);
    if (!Number.isSafeInteger(unitPricePaise) || unitPricePaise <= 0) {
      throw new Error("A product has an invalid price and cannot be purchased.");
    }
    return {
      product,
      quantity: item.quantity,
      unitPricePaise,
      lineTotalPaise: unitPricePaise * item.quantity,
    };
  });
  const totalPaise = orderLines.reduce((total, item) => total + item.lineTotalPaise, 0);
  if (!Number.isSafeInteger(totalPaise)) throw new Error("The cart total is too large to process.");
  if (expectedTotal !== undefined && Math.round(expectedTotal * 100) !== totalPaise) {
    throw new Error("Product prices changed. Refresh the catalogue and review your cart again.");
  }
  const advancePaise = Math.round(totalPaise * 0.2);
  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      customer_id: userId,
      product_id: orderLines[0].product.id,
      total_amount: totalPaise / 100,
      advance_amount: advancePaise / 100,
      status: "pending",
    })
    .select("id, order_number")
    .single();

  if (orderError || !order) throw new Error("Could not create your order.");

  const { error: orderItemsError } = await admin.from("order_items").insert(
    orderLines.map(({ product, quantity, unitPricePaise, lineTotalPaise }) => ({
      order_id: order.id,
      product_id: product.id,
      sku: product.sku,
      metal: product.metal,
      purity: product.purity,
      weight_grams: product.weight_grams,
      quantity,
      unit_price: unitPricePaise / 100,
      total_amount: lineTotalPaise / 100,
    })),
  );
  if (orderItemsError) {
    const { error: cancelError } = await admin.from("orders").update({ status: "cancelled" }).eq("id", order.id);
    if (cancelError) throw new Error("Could not save your cart or cancel the pending order. Contact support.");
    throw new Error("Could not save your cart items.");
  }

  try {
    const razorpayOrder = await razorpayRequest("/orders", "POST", {
      amount: advancePaise,
      currency: "INR",
      receipt: order.id,
      notes: { supabase_order_id: order.id, item_count: String(orderLines.length) },
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
      totalAmount: totalPaise / 100,
    };
  } catch (error) {
    const { error: cancelError } = await admin.from("orders").update({ status: "cancelled" }).eq("id", order.id);
    if (cancelError) throw new Error("Checkout failed and the pending order could not be canceled. Contact support.");
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
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ error: "Invalid checkout request." }, 400);
    }
    if (body.action === "create") {
      const requestedItems: RequestedItem[] = Array.isArray(body.items)
        ? body.items
        : typeof body.sku === "string" ? [{ sku: body.sku, quantity: 1 }] : [];
      if (requestedItems.length === 0 || requestedItems.length > 50) {
        return json({ error: "Add between 1 and 50 product denominations to your cart." }, 400);
      }
      const seenSkus = new Set<string>();
      for (const item of requestedItems) {
        if (!item || typeof item.sku !== "string" || !item.sku.trim()
          || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
          return json({ error: "Each cart item must have a valid product and a quantity from 1 to 99." }, 400);
        }
        item.sku = item.sku.trim();
        if (seenSkus.has(item.sku)) return json({ error: "Each product may only appear once in the cart." }, 400);
        seenSkus.add(item.sku);
      }
      const expectedTotal = body.expectedTotal;
      if (expectedTotal !== undefined && (typeof expectedTotal !== "number" || !Number.isFinite(expectedTotal) || expectedTotal <= 0)) {
        return json({ error: "The expected cart total is invalid." }, 400);
      }
      const result = await createPaymentOrder(admin, user.id, requestedItems, expectedTotal);
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