import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature, PAYSTACK_SECRET_KEY } from "@/lib/paystack-server";

/**
 * Paystack Webhook Handler
 *
 * Paystack sends POST requests to this endpoint when payment events occur.
 * The endpoint URL should be registered in your Paystack dashboard:
 * Settings → Webhooks → Add URL → https://your-domain.com/api/paystack/webhook
 */
export async function POST(req: NextRequest) {
  try {
    // Verify webhook signature
    const signature = req.headers.get("x-paystack-signature") || "";
    const body = await req.text();

    if (!PAYSTACK_SECRET_KEY) {
      console.error("Paystack webhook: secret key not configured");
      return NextResponse.json({ error: "Not configured" }, { status: 503 });
    }

    const isValid = verifyWebhookSignature(body, signature);
    if (!isValid) {
      console.error("Paystack webhook: invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const event = JSON.parse(body);
    const { event: eventType, data } = event;

    console.log(`Paystack webhook received: ${eventType}`, {
      reference: data?.reference,
      status: data?.status,
      amount: data?.amount,
    });

    switch (eventType) {
      case "charge.success": {
        // Payment was successful — update subscription status
        const { reference, amount, customer, metadata } = data;
        const plan = metadata?.plan || "VPS S";

        // Here you would update Firestore with the payment record
        // e.g., create a subscription_payments document
        console.log(
          `Payment successful: ${reference}, ${amount / 100} KES, ${plan}`
        );

        // TODO: Save to Firestore when Firebase Admin SDK is configured
        // const { db } = await import("@/lib/firebase-admin");
        // await db.collection("subscription_payments").add({
        //   reference,
        //   amount: amount / 100,
        //   currency: data.currency,
        //   plan,
        //   email: customer?.email,
        //   status: "paid",
        //   paidAt: data.paid_at,
        //   createdAt: new Date().toISOString(),
        // });

        break;
      }

      case "charge.failed": {
        console.warn(
          `Payment failed: ${data?.reference}, reason: ${data?.status}`
        );
        break;
      }

      default:
        console.log(`Unhandled webhook event: ${eventType}`);
    }

    // Always return 200 to acknowledge receipt
    return NextResponse.json({ status: "ok" });
  } catch (err: any) {
    console.error("Paystack webhook error:", err);
    // Still return 200 to prevent Paystack from retrying malformed payloads
    return NextResponse.json({ status: "ok" }, { status: 200 });
  }
}
