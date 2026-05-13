export interface StockData {
  symbol: string;
  price: number;
  changePercent: number;
  volume: number;
  movingAverage20: number;
  trend: "Bullish" | "Bearish" | "Sideway";
  rsi: number;
  macd: string;
  obvTrend: string;
  bbWidth: string;
  support: number;
  resistance: number;
  smcSignal: string;
  vsaSignal: string;
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
export async function fetchStockData(refresh: boolean = false): Promise<StockData[]> {
  const fetchUrl = refresh ? `${API_URL}/api/market/stocks?refresh=true` : `${API_URL}/api/market/stocks`;
  const res = await fetch(fetchUrl, {
    next: { revalidate: 60 }, // Cache trong 60 giây
    signal: AbortSignal.timeout(60000) // Tăng timeout lên 60s cho Render cold start
  });
  if (!res.ok) throw new Error("Lỗi kết nối Backend Python (Stocks). Vui lòng kiểm tra backend trên Render.");
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Backend trả về dữ liệu rỗng. Vui lòng thử lại sau.");
  }
  return data;
}

/**
 * Fetch Macro News
 * Gọi sang Python FastAPI Backend (cổng 8000) để lấy tin tức thật từ RSS CafeF.
 */
export async function fetchMacroNews(): Promise<MacroNews[]> {
  const res = await fetch(`${API_URL}/api/market/news`, {
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(60000)
  });
  if (!res.ok) throw new Error("Lỗi kết nối Backend Python (News). Vui lòng kiểm tra backend trên Render.");
  return await res.json();
}

/**
 * Fetch Single Stock Data
 * Lấy dữ liệu kỹ thuật cho 1 mã cổ phiếu bất kỳ (không cần nằm trong danh sách theo dõi).
 */
export async function fetchSingleStock(symbol: string): Promise<StockData> {
  const res = await fetch(`${API_URL}/api/market/stock/${symbol.toUpperCase()}`, {
    signal: AbortSignal.timeout(60000)
  });
  if (!res.ok) throw new Error(`Lỗi kết nối Backend khi lấy dữ liệu mã ${symbol}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}
