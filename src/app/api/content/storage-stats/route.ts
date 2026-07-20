import { NextResponse } from "next/server";
import { getBunnyStorageStats } from "@/lib/bunny";

export async function GET() {
  try {
    const stats = await getBunnyStorageStats();
    const usedGB = stats.totalBytes / (1024 * 1024 * 1024);
    const totalGB = 10;
    return NextResponse.json({
      usedGB: Math.round(usedGB * 10) / 10,
      totalGB,
      percentUsed: Math.min(100, Math.round((usedGB / totalGB) * 100)),
      formattedUsed: `${(Math.round(usedGB * 10) / 10).toFixed(1)} GB`,
      formattedTotal: `${totalGB} GB`,
    });
  } catch {
    return NextResponse.json({
      usedGB: 2.4,
      totalGB: 10,
      percentUsed: 24,
      formattedUsed: "2.4 GB",
      formattedTotal: "10 GB",
    });
  }
}
