/**
 * Paystack client-side helpers.
 * Server-only functions are in paystack-server.ts to avoid bundling Node crypto on client.
 */

// ═══════════════════════════════════════════════
// Configuration (Public key only — safe for client)
// ═══════════════════════════════════════════════

export const PAYSTACK_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || "";

// ═══════════════════════════════════════════════
// Plan Pricing (single source of truth)
// ═══════════════════════════════════════════════

export const PAYSTACK_PLANS = {
  "VPS S": { amountKES: 4372, label: "KES 4,372" },
  "VPS M": { amountKES: 5790, label: "KES 5,790" },
} as const;

export type PlanKey = keyof typeof PAYSTACK_PLANS;

// ═══════════════════════════════════════════════
// Client SDK
// ═══════════════════════════════════════════════

/**
 * Dynamically load the Paystack inline JS SDK.
 */
export function loadPaystackSDK(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).PaystackPop) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.paystack.co/v1/inline.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Paystack SDK"));
    document.head.appendChild(script);
  });
}
