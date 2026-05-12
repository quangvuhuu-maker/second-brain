import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(req: Request) {
  try {
    const { keysArray, uid } = await req.json();

    if (!uid) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    if (!Array.isArray(keysArray)) {
      return NextResponse.json({ success: false, error: "Invalid data format" }, { status: 400 });
    }

    // Use adminDb to bypass client-side security rules and ensure the write goes through
    await adminDb.collection("settings").doc("api_keys").set({
      geminiKeys: keysArray,
      updatedAt: new Date(),
      updatedBy: uid
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error saving API keys:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
