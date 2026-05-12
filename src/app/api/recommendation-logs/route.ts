import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol")?.toUpperCase();
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    let query = adminDb
      .collection("recommendation_logs")
      .orderBy("date", "desc")
      .limit(90); // Tối đa 90 ngày

    if (dateFrom) {
      query = query.where("date", ">=", dateFrom);
    }
    if (dateTo) {
      query = query.where("date", "<=", dateTo);
    }

    const snapshot = await query.get();
    const logs: Record<string, unknown>[] = [];

    snapshot.forEach((doc) => {
      const data = doc.data();

      // Nếu có filter theo symbol, chỉ giữ log chứa symbol đó
      if (symbol) {
        const hasBuy = data.topBuys?.some(
          (s: { symbol: string }) => s.symbol === symbol
        );
        const hasSell = data.topSells?.some(
          (s: { symbol: string }) => s.symbol === symbol
        );
        if (!hasBuy && !hasSell) return;
      }

      logs.push({
        id: doc.id,
        date: data.date,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
        topBuys: data.topBuys || [],
        topSells: data.topSells || [],
      });
    });

    return NextResponse.json({ success: true, data: logs });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
