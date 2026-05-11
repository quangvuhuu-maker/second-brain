export interface StockData {
  symbol: string;
  price: number;
  changePercent: number;
  volume: number;
  movingAverage20: number;
  trend: "Bullish" | "Bearish" | "Sideway";
}

export interface MacroNews {
  title: string;
  summary: string;
  time: string;
  impact: "Positive" | "Negative" | "Neutral";
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

/**
 * Fetch Stock Data
 * Gọi sang Python FastAPI Backend (cổng 8000) để lấy dữ liệu chứng khoán thật từ vnstock.
 */
export async function fetchStockData(): Promise<StockData[]> {
  try {
    const res = await fetch(`${API_URL}/api/market/stocks`, {
      next: { revalidate: 60 } // Cache trong 60 giây
    });
    if (!res.ok) throw new Error("Lỗi kết nối Backend Python (Stocks)");
    return await res.json();
  } catch (error) {
    console.error(error);
    // Fallback Mock Data nếu Python chưa chạy
    return [
      { symbol: "FPT", price: 115500, changePercent: 2.4, volume: 3500000, movingAverage20: 112000, trend: "Bullish" }
    ];
  }
}

/**
 * Fetch Macro News
 * Gọi sang Python FastAPI Backend (cổng 8000) để lấy tin tức thật từ RSS CafeF.
 */
export async function fetchMacroNews(): Promise<MacroNews[]> {
  try {
    const res = await fetch(`${API_URL}/api/market/news`, {
      next: { revalidate: 60 }
    });
    if (!res.ok) throw new Error("Lỗi kết nối Backend Python (News)");
    return await res.json();
  } catch (error) {
    console.error(error);
    // Fallback Mock Data
    return [
      {
        title: "Tin giả lập do Backend Python chưa bật",
        summary: "Vui lòng chạy lệnh 'uvicorn main:app --port 8000' trong thư mục backend.",
        time: "1 phút trước",
        impact: "Neutral"
      }
    ];
  }
}
