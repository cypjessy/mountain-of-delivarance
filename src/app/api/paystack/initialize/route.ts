import { NextRequest, NextResponse } from "next/server";
import { initializeTransaction, PAYSTACK_SECRET_KEY } from "@/lib/paystack-server";
import { PAYSTACK_PLANS } from "@/lib/paystack";

export async function POST(req: NextRequest) {
  try {
    // Check Paystack is configured
    if (!PAYSTACK_SECRET_KEY) {
      return NextResponse.json(
        { error: "Paystack is not configured. Set PAYSTACK_SECRET_KEY in environment variables." },
        { status: 503 }
      );
    }

    const { email, plan } = await req.json();

    // Validate required fields
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Validate plan
    if (!plan || !PAYSTACK_PLANS[plan as keyof typeof PAYSTACK_PLANS]) {
      return NextResponse.json(
        { error: `Invalid plan. Supported: ${Object.keys(PAYSTACK_PLANS).join(", ")}` },
        { status: 400 }
      );
    }

    const planConfig = PAYSTACK_PLANS[plan as keyof typeof PAYSTACK_PLANS];

    // Initialize transaction with Paystack
    const result = await initializeTransaction({
      email,
      amountInKES: planConfig.amountKES,
      metadata: {
        plan,
        church_id: process.env.NEXT_PUBLIC_CHURCH_ID || "mountain_of_deliverance",
        payment_for: `${plan} subscription`,
      },
    });

    if (!result.status || !result.data) {
      console.error("Paystack init failed:", result.message);
      return NextResponse.json(
        { error: result.message || "Failed to initialize payment" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      authorization_url: result.data.authorization_url,
      access_code: result.data.access_code,
      reference: result.data.reference,
    });
  } catch (err: any) {
    console.error("Paystack initialize error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
