import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

/**
 * GET /api/stock-price/historical?symbols=VIX,FPT&date=2023-05-12
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get("symbols");
    const dateParam = searchParams.get("date");

    if (!symbolsParam || !dateParam) {
      return NextResponse.json(
        { success: false, error: "Thiếu param 'symbols' hoặc 'date'" },
        { status: 400 }
      );
    }

    const res = await fetch(`${API_URL}/api/market/historical-prices?symbols=${encodeURIComponent(symbolsParam)}&date=${encodeURIComponent(dateParam)}`, {
      next: { revalidate: 3600 }, // Cache trong 1 giờ cho giá lịch sử
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) {
      throw new Error(`Python API Error: ${res.statusText}`);
    }

    const data = await res.json();

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
