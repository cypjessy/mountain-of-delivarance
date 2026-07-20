import { NextRequest, NextResponse } from "next/server";
import { verifyTransaction } from "@/lib/paystack-server";

export async function POST(req: NextRequest) {
  try {
    const { reference } = await req.json();

    if (!reference) {
      return NextResponse.json({ error: "reference is required" }, { status: 400 });
    }

    const result = await verifyTransaction(reference);

    if (!result.status) {
      console.error("[Paystack] Verify error:", result.message);
      return NextResponse.json({ error: result.message || "Paystack verification failed" }, { status: 502 });
    }

    const payment = result.data;
    if (!payment) {
      return NextResponse.json({ verified: false, error: "No payment data returned" });
    }

    const verified = payment.status === "success";

    return NextResponse.json({
      verified,
      reference: payment.reference,
      amount: payment.amount / 100,
      channel: payment.channel,
      paidAt: payment.paid_at,
      metadata: payment.metadata,
    });
  } catch (err: any) {
    console.error("[Paystack] Verify exception:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
