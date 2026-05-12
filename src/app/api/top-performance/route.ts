import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { fetchStockData } from "@/lib/market-data";

export async function GET() {
  try {
    const logsSnapshot = await adminDb.collection("recommendation_logs").get();
    
    if (logsSnapshot.empty) {
      return NextResponse.json({ success: true, data: [] });
    }

    interface RecRecord {
      date: string;
      price: number;
    }

    const buyRecords: Record<string, RecRecord[]> = {};
    const sellRecords: Record<string, RecRecord[]> = {};

    // Gom nhóm tất cả các khuyến nghị theo mã
    logsSnapshot.forEach(doc => {
      const data = doc.data();
      const date = data.date; // YYYY-MM-DD
      
      const buys = data.topBuys || [];
      const sells = data.topSells || [];

      buys.forEach((b: any) => {
        if (!buyRecords[b.symbol]) buyRecords[b.symbol] = [];
        buyRecords[b.symbol].push({ date, price: b.entryPrice });
      });

      sells.forEach((s: any) => {
        if (!sellRecords[s.symbol]) sellRecords[s.symbol] = [];
        sellRecords[s.symbol].push({ date, price: s.sellPrice });
      });
    });

    // Lấy giá hiện tại
    const currentStocks = await fetchStockData();
    const currentPrices: Record<string, number> = {};
    currentStocks.forEach(s => {
      currentPrices[s.symbol] = s.price;
    });

    const results: any[] = [];
    const today = new Date();

    // Xử lý nhóm Buy
    for (const [symbol, records] of Object.entries(buyRecords)) {
      if (!currentPrices[symbol]) continue;
      
      // Sắp xếp ngày từ cũ đến mới
      records.sort((a, b) => a.date.localeCompare(b.date));
      
      const baseline = records[0];
      const latest = records[records.length - 1];
      
      let additionalNote = null;
      if (records.length > 1 && baseline.date !== latest.date) {
        additionalNote = `AI tiếp tục khuyến nghị mua thêm vào ${latest.date} vùng giá ${latest.price.toLocaleString("vi-VN")}`;
      }

      const cp = currentPrices[symbol];
      const pl = ((cp - baseline.price) / baseline.price) * 100;
      
      const baselineDate = new Date(baseline.date);
      const diffTime = Math.abs(today.getTime() - baselineDate.getTime());
      const daysSince = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      results.push({
        type: "BUY",
        symbol,
        baselineDate: baseline.date,
        baselinePrice: baseline.price,
        currentPrice: cp,
        plPercent: pl,
        daysSince,
        additionalNote
      });
    }

    // Xử lý nhóm Sell
    for (const [symbol, records] of Object.entries(sellRecords)) {
      if (!currentPrices[symbol]) continue;
      
      records.sort((a, b) => a.date.localeCompare(b.date));
      
      const baseline = records[0];
      const latest = records[records.length - 1];
      
      let additionalNote = null;
      if (records.length > 1 && baseline.date !== latest.date) {
        additionalNote = `AI tiếp tục cảnh báo bán/cắt lỗ vào ${latest.date} vùng giá ${latest.price.toLocaleString("vi-VN")}`;
      }

      const cp = currentPrices[symbol];
      // Nếu bán ở giá 100, hiện tại giá 80 -> Tránh được lỗ 20% -> Hiệu quả +20%
      const pl = ((baseline.price - cp) / baseline.price) * 100;
      
      const baselineDate = new Date(baseline.date);
      const diffTime = Math.abs(today.getTime() - baselineDate.getTime());
      const daysSince = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      results.push({
        type: "SELL",
        symbol,
        baselineDate: baseline.date,
        baselinePrice: baseline.price,
        currentPrice: cp,
        plPercent: pl,
        daysSince,
        additionalNote
      });
    }

    // Sắp xếp hiệu quả từ cao xuống thấp
    results.sort((a, b) => b.plPercent - a.plPercent);

    // Lấy Top 10
    const top10 = results.slice(0, 10);

    return NextResponse.json({ success: true, data: top10 });

  } catch (error: any) {
    console.error("Top performance error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
