import { NextRequest, NextResponse } from "next/server";
import { fetchStockData } from "@/lib/market-data";

/**
 * GET /api/stock-price?symbols=VIX,FPT,VCB
 * Lấy giá hiện tại của các mã cổ phiếu từ Python backend.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbolsParam = searchParams.get("symbols");

    if (!symbolsParam) {
      return NextResponse.json(
        { success: false, error: "Thiếu param 'symbols'" },
        { status: 400 }
      );
    }

    const requestedSymbols = symbolsParam
      .toUpperCase()
      .split(",")
      .map((s) => s.trim());

    // Lấy toàn bộ dữ liệu từ backend Python
    const allStocks = await fetchStockData();

    // Lọc chỉ lấy các mã yêu cầu
    const prices: Record<string, number | null> = {};
    for (const sym of requestedSymbols) {
      const found = allStocks.find((s) => s.symbol === sym);
      prices[sym] = found ? found.price : null;
    }

    return NextResponse.json({ success: true, data: prices });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
