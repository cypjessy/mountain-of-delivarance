import { NextRequest, NextResponse } from "next/server";
import { initializeTransaction } from "@/lib/paystack-server";
import { PAYSTACK_PLANS } from "@/lib/paystack";

export async function POST(req: NextRequest) {
  try {
    const { email, plan, amount } = await req.json();

    if (!email || !plan) {
      return NextResponse.json({ error: "email and plan are required" }, { status: 400 });
    }

    const planConfig = PAYSTACK_PLANS[plan as keyof typeof PAYSTACK_PLANS];
    if (!planConfig) {
      return NextResponse.json({ error: `Unknown plan: ${plan}` }, { status: 400 });
    }

    const result = await initializeTransaction({
      email,
      amountInKES: amount ?? planConfig.amountKES,
      metadata: { plan },
    });

    if (!result.status) {
      console.error("[Paystack] Init error:", result.message);
      return NextResponse.json({ error: result.message || "Paystack initialization failed" }, { status: 502 });
    }

    return NextResponse.json(result.data);
  } catch (err: any) {
    console.error("[Paystack] Init exception:", err);
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}
