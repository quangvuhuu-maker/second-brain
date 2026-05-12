"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollText, Search, Loader2, TrendingUp, TrendingDown, BarChart2 } from "lucide-react";

interface LogBuy { symbol: string; entryPrice: number; targetPrice: number; stopLossPrice: number; currentPrice: number; upsidePercent: number; }
interface LogSell { symbol: string; sellPrice: number; targetPrice: number; currentPrice: number; downsidePercent: number; }
interface LogEntry { id: string; date: string; createdAt: string; topBuys: LogBuy[]; topSells: LogSell[]; }
interface PriceMap { [symbol: string]: number | null; }

export default function RecommendationLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [prices, setPrices] = useState<PriceMap>({});
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [searched, setSearched] = useState(false);
  const [evalDate, setEvalDate] = useState("");

  const fetchLogs = async () => {
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams();
      if (symbol.trim()) params.set("symbol", symbol.trim().toUpperCase());
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const res = await fetch(`/api/recommendation-logs?${params}`);
      const json = await res.json();
      if (json.success) {
        setLogs(json.data);
        // Lấy giá hiện tại cho các mã
        await fetchCurrentPrices(json.data);
      }
    } catch (err) {
      console.error("Fetch logs error:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCurrentPrices = async (logData: LogEntry[]) => {
    const allSymbols = new Set<string>();
    logData.forEach(log => {
      log.topBuys?.forEach(s => allSymbols.add(s.symbol));
      log.topSells?.forEach(s => allSymbols.add(s.symbol));
    });
    if (allSymbols.size === 0) return;
    setLoadingPrices(true);
    try {
      const symbolsStr = Array.from(allSymbols).join(",");
      let url = `/api/stock-price?symbols=${symbolsStr}`;
      
      if (evalDate) {
        const todayStr = new Date().toISOString().slice(0, 10);
        if (evalDate < todayStr) {
          url = `/api/stock-price/historical?symbols=${symbolsStr}&date=${evalDate}`;
        }
      }

      const res = await fetch(url);
      const json = await res.json();
      if (json.success) setPrices(json.data);
    } catch (err) {
      console.error("Fetch prices error:", err);
    } finally {
      setLoadingPrices(false);
    }
  };

  const calcPL = (entry: number, current: number | null | undefined) => {
    if (!current || !entry || entry === 0) return null;
    return ((current - entry) / entry * 100).toFixed(2);
  };

  // Thống kê tổng quan
  const stats = (() => {
    let totalBuys = 0, winBuys = 0, totalSells = 0, winSells = 0;
    const filterSym = symbol.trim().toUpperCase();
    logs.forEach(log => {
      const buys = filterSym ? log.topBuys?.filter(s => s.symbol === filterSym) : log.topBuys;
      const sells = filterSym ? log.topSells?.filter(s => s.symbol === filterSym) : log.topSells;
      buys?.forEach(b => {
        const cp = prices[b.symbol];
        if (cp != null) { totalBuys++; if (cp > b.entryPrice) winBuys++; }
      });
      sells?.forEach(s => {
        const cp = prices[s.symbol];
        if (cp != null) { totalSells++; if (cp < s.sellPrice) winSells++; }
      });
    });
    return { totalBuys, winBuys, totalSells, winSells };
  })();

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <ScrollText className="h-8 w-8 text-primary" />Nhật ký khuyến nghị
        </h1>
        <p className="text-muted-foreground mt-1">Tra cứu lịch sử và đánh giá hiệu quả khuyến nghị AI.</p>
      </div>

      {/* Bộ lọc */}
      <Card className="border shadow-sm">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Mã cổ phiếu</label>
              <Input value={symbol} onChange={e => setSymbol(e.target.value)} placeholder="VD: VIX, FPT..." className="h-10" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Từ ngày</label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Đến ngày</label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-primary">Ngày đánh giá</label>
              <Input type="date" value={evalDate} onChange={e => setEvalDate(e.target.value)} className="h-10 border-primary/50" />
            </div>
            <div className="flex items-end">
              <Button onClick={fetchLogs} disabled={loading} className="h-10">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                Tìm kiếm
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Thống kê */}
      {searched && !loading && logs.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-xs text-muted-foreground">KN Mua</p>
              <p className="text-2xl font-bold text-emerald-500">{stats.totalBuys}</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-xs text-muted-foreground">Mua đúng</p>
              <p className="text-2xl font-bold text-emerald-500">
                {stats.totalBuys > 0 ? `${(stats.winBuys / stats.totalBuys * 100).toFixed(0)}%` : "–"}
              </p>
            </CardContent>
          </Card>
          <Card className="border-rose-500/20 bg-rose-500/5">
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-xs text-muted-foreground">KN Bán</p>
              <p className="text-2xl font-bold text-rose-500">{stats.totalSells}</p>
            </CardContent>
          </Card>
          <Card className="border-rose-500/20 bg-rose-500/5">
            <CardContent className="pt-4 pb-4 text-center">
              <p className="text-xs text-muted-foreground">Bán đúng</p>
              <p className="text-2xl font-bold text-rose-500">
                {stats.totalSells > 0 ? `${(stats.winSells / stats.totalSells * 100).toFixed(0)}%` : "–"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Kết quả */}
      {loading && <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}

      {searched && !loading && logs.length === 0 && (
        <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground">Không tìm thấy log nào.</CardContent></Card>
      )}

      {!loading && logs.map(log => {
        const filterSym = symbol.trim().toUpperCase();
        const buys = filterSym ? log.topBuys?.filter(s => s.symbol === filterSym) : log.topBuys;
        const sells = filterSym ? log.topSells?.filter(s => s.symbol === filterSym) : log.topSells;
        return (
          <Card key={log.id} className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart2 className="h-5 w-5 text-primary" />{log.date}
              </CardTitle>
              <CardDescription>Tạo lúc: {log.createdAt ? new Date(log.createdAt).toLocaleString("vi-VN") : "N/A"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {buys && buys.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-emerald-500 flex items-center gap-1 mb-2"><TrendingUp className="h-4 w-4" />Khuyến nghị MUA</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-muted-foreground text-xs">
                        <th className="py-2 text-left">Mã</th><th className="py-2 text-right">Giá mua</th>
                        <th className="py-2 text-right">Mục tiêu</th><th className="py-2 text-right">Cắt lỗ</th>
                        <th className="py-2 text-right">Giá hiện tại</th><th className="py-2 text-right">Lãi/Lỗ</th>
                      </tr></thead>
                      <tbody>{buys.map((b, i) => {
                        const cp = prices[b.symbol];
                        const pl = calcPL(b.entryPrice, cp);
                        return (
                          <tr key={i} className="border-b border-border/30">
                            <td className="py-2 font-bold text-emerald-400">{b.symbol}</td>
                            <td className="py-2 text-right">{b.entryPrice?.toLocaleString("vi-VN")}</td>
                            <td className="py-2 text-right text-emerald-500">{b.targetPrice?.toLocaleString("vi-VN")}</td>
                            <td className="py-2 text-right text-rose-500">{b.stopLossPrice?.toLocaleString("vi-VN")}</td>
                            <td className="py-2 text-right font-medium">{loadingPrices ? "..." : cp != null ? cp.toLocaleString("vi-VN") : "N/A"}</td>
                            <td className={`py-2 text-right font-bold ${pl && parseFloat(pl) >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                              {loadingPrices ? "..." : pl != null ? `${parseFloat(pl) >= 0 ? "+" : ""}${pl}%` : "–"}
                            </td>
                          </tr>
                        );
                      })}</tbody>
                    </table>
                  </div>
                </div>
              )}
              {sells && sells.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-rose-500 flex items-center gap-1 mb-2"><TrendingDown className="h-4 w-4" />Khuyến nghị BÁN</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b text-muted-foreground text-xs">
                        <th className="py-2 text-left">Mã</th><th className="py-2 text-right">Giá bán</th>
                        <th className="py-2 text-right">Mục tiêu</th><th className="py-2 text-right">Giá hiện tại</th>
                        <th className="py-2 text-right">Hiệu quả</th>
                      </tr></thead>
                      <tbody>{sells.map((s, i) => {
                        const cp = prices[s.symbol];
                        const pl = calcPL(s.sellPrice, cp);
                        const isWin = pl != null && parseFloat(pl) < 0; // Bán mà giá giảm = đúng
                        return (
                          <tr key={i} className="border-b border-border/30">
                            <td className="py-2 font-bold text-rose-400">{s.symbol}</td>
                            <td className="py-2 text-right">{s.sellPrice?.toLocaleString("vi-VN")}</td>
                            <td className="py-2 text-right text-rose-400">{s.targetPrice?.toLocaleString("vi-VN")}</td>
                            <td className="py-2 text-right font-medium">{loadingPrices ? "..." : cp != null ? cp.toLocaleString("vi-VN") : "N/A"}</td>
                            <td className={`py-2 text-right font-bold ${isWin ? "text-emerald-500" : "text-rose-500"}`}>
                              {loadingPrices ? "..." : pl != null ? (isWin ? "Đúng ✓" : "Sai ✗") : "–"}
                            </td>
                          </tr>
                        );
                      })}</tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
