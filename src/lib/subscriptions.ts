/**
 * Subscription payment tracking service.
 * Stores payment records and subscription status in Firestore.
 */

import { db } from "./firebase";
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp,
} from "firebase/firestore";

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

export interface SubscriptionPayment {
  id?: string;
  reference: string;
  amount: number; // KES
  plan: "VPS S" | "VPS M";
  status: "paid" | "partial" | "failed";
  paidAt: Timestamp | null;
  billingPeriod: string; // "YYYY-MM"
  email: string;
  channel: string;
  church_id: string;
  createdAt?: Timestamp | null;
}

export interface SubscriptionStatus {
  plan: "VPS S" | "VPS M";
  totalDue: number; // full monthly amount
  paidThisPeriod: number; // amount paid so far
  billingPeriod: string; // "YYYY-MM"
  lastPaidAt: Timestamp | null;
  status: "paid" | "partial" | "overdue" | "pending";
  updatedAt?: Timestamp | null;
}

// ═══════════════════════════════════════════════
// Pricing
// ═══════════════════════════════════════════════

export const PLAN_PRICES: Record<string, number> = {
  "VPS S": 4372,
  "VPS M": 5790,
};

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

/**
 * Get the current billing period as "YYYY-MM".
 * Billing runs from the 10th of one month to the 9th of the next.
 */
export function getCurrentBillingPeriod(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  // If before the 10th, the current billing period is last month → this month
  if (now.getDate() < 10) {
    const prev = new Date(year, month - 1, 1);
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  }
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

/**
 * Get the billing period label for display.
 */
export function getBillingPeriodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/**
 * Get the next billing date (10th of current or next month).
 */
export function getNextBillingDate(): Date {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const dueThisMonth = new Date(year, month, 10, 12, 0, 0);
  if (now < dueThisMonth) return dueThisMonth;
  return new Date(year, month + 1, 10, 12, 0, 0);
}

/**
 * Get countdown from milliseconds.
 */
export function getCountdown(ms: number) {
  if (ms <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  const totalSec = Math.floor(ms / 1000);
  return {
    days: Math.floor(totalSec / 86400),
    hours: Math.floor((totalSec % 86400) / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
  };
}

// ═══════════════════════════════════════════════
// Firestore Operations
// ═══════════════════════════════════════════════

const PAYMENTS_COL = "subscription_payments";
const STATUS_DOC = "subscription_status";

/**
 * Record a successful payment in Firestore.
 */
export async function recordPayment(data: Omit<SubscriptionPayment, "id" | "createdAt">): Promise<string> {
  const ref = await addDoc(collection(db, PAYMENTS_COL), {
    ...data,
    createdAt: serverTimestamp(),
  });
  // Update subscription status
  await updateSubscriptionStatus(data);
  return ref.id;
}

/**
 * Update the aggregated subscription status after a payment.
 */
async function updateSubscriptionStatus(payment: Omit<SubscriptionPayment, "id" | "createdAt">) {
  const statusRef = doc(db, PAYMENTS_COL, STATUS_DOC);
  const statusSnap = await getDoc(statusRef);

  const currentPeriod = payment.billingPeriod;
  const amount = payment.amount;
  const plan = payment.plan;
  const totalDue = PLAN_PRICES[plan] || 4372;

  const now = new Date();
  const day = now.getDate();
  const isOverdue = day > 10;

  if (statusSnap.exists()) {
    const existing = statusSnap.data() as SubscriptionStatus;

    // Same billing period — accumulate
    if (existing.billingPeriod === currentPeriod) {
      const newPaid = existing.paidThisPeriod + amount;
      let newStatus: SubscriptionStatus["status"];
      if (newPaid >= totalDue) {
        newStatus = "paid";
      } else if (isOverdue) {
        newStatus = "overdue";
      } else {
        newStatus = "partial";
      }

      await setDoc(statusRef, {
        ...existing,
        plan,
        totalDue,
        paidThisPeriod: Math.min(newPaid, totalDue),
        lastPaidAt: payment.paidAt || Timestamp.now(),
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
    } else {
      // New billing period
      const newPaid = amount;
      let newStatus: SubscriptionStatus["status"];
      if (newPaid >= totalDue) {
        newStatus = "paid";
      } else if (isOverdue) {
        newStatus = "overdue";
      } else {
        newStatus = "partial";
      }

      await setDoc(statusRef, {
        plan,
        totalDue,
        paidThisPeriod: Math.min(newPaid, totalDue),
        billingPeriod: currentPeriod,
        lastPaidAt: payment.paidAt || Timestamp.now(),
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
    }
  } else {
    // First payment ever
    const newPaid = amount;
    let newStatus: SubscriptionStatus["status"];
    if (newPaid >= totalDue) {
      newStatus = "paid";
    } else if (isOverdue) {
      newStatus = "overdue";
    } else {
      newStatus = "partial";
    }

    await setDoc(statusRef, {
      plan,
      totalDue,
      paidThisPeriod: Math.min(newPaid, totalDue),
      billingPeriod: currentPeriod,
      lastPaidAt: payment.paidAt || Timestamp.now(),
      status: newStatus,
      updatedAt: serverTimestamp(),
    });
  }
}

/**
 * Get the current subscription status from Firestore.
 */
export async function getSubscriptionStatus(): Promise<SubscriptionStatus | null> {
  try {
    const statusRef = doc(db, PAYMENTS_COL, STATUS_DOC);
    const snap = await getDoc(statusRef);
    if (snap.exists()) {
      return snap.data() as SubscriptionStatus;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get all payment records for history display.
 */
export async function getPaymentHistory(): Promise<SubscriptionPayment[]> {
  try {
    const q = query(
      collection(db, PAYMENTS_COL),
      where("status", "!=", "failed"),
      orderBy("paidAt", "desc"),
      limit(50)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SubscriptionPayment));
  } catch {
    return [];
  }
}

/**
 * Compute the balance (amount still due) for the current period.
 */
export function computeBalance(status: SubscriptionStatus | null): number {
  if (!status) return 4372; // default VPS S price
  const balance = status.totalDue - status.paidThisPeriod;
  return Math.max(0, balance);
}
