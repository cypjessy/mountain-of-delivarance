import { NextRequest, NextResponse } from "next/server";
import { deleteFromR2 } from "@/lib/r2";

export async function DELETE(req: NextRequest) {
  try {
    const { key } = await req.json();

    if (!key) {
      return NextResponse.json({ error: "key is required" }, { status: 400 });
    }

    await deleteFromR2(key);

    return NextResponse.json({ deleted: true });
  } catch (err: any) {
    console.error("[R2] Delete error:", err);
    return NextResponse.json({ error: err.message || "Failed to delete" }, { status: 500 });
  }
}
