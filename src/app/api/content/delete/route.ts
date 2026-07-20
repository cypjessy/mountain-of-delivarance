import { NextRequest, NextResponse } from "next/server";
import { deleteFromBunny } from "@/lib/bunny";

export async function DELETE(req: NextRequest) {
  try {
    const { storage_paths } = await req.json();
    if (!storage_paths || !Array.isArray(storage_paths)) {
      return NextResponse.json({ error: "storage_paths array is required" }, { status: 400 });
    }

    const results = await Promise.allSettled(storage_paths.map((p: string) => deleteFromBunny(p)));
    const failed = results.filter((r) => r.status === "rejected").length;

    return NextResponse.json({ deleted: storage_paths.length - failed, failed });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Delete failed" }, { status: 500 });
  }
}
