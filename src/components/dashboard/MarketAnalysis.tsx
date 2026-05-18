"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus, RefreshCw, Loader2, Clock } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

interface AnalysisData {
  marketTrend: "Bullish" | "Bearish" | "Sideway";
  trendReason: string;
  macroImpact: "Positive" | "Negative" | "Neutral";
  macroReason: string;
  aiSuggestion: "Buy" | "Sell" | "Hold";
  aiReasoning: string;
  strongStocks: { symbol: string; price: number; changePercent: number; reason: string }[];
  weakStocks: { symbol: string; price: number; changePercent: number; reason: string }[];
  newsRecap: { title: string; summary: string; time: string }[];
}

function formatCachedTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  } catch {
    return isoStr;
  }
}

export function MarketAnalysis() {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [isStale, setIsStale] = useState(false);

  const fetchAnalysis = useCallback(async (refresh = false) => {
    setLoading(true);
    setError("");
    try {
      const url = refresh ? "/api/analyze-market?refresh=true" : "/api/analyze-market";
      const res = await fetch(url, {
        signal: AbortSignal.timeout(90000), // 90s timeout phía client
      });

      // Đọc response dạng text trước để tránh crash khi Vercel trả HTML/text
      const rawText = await res.text();
      let json: any;
      try {
        json = JSON.parse(rawText);
      } catch {
        // Vercel trả về "An error occurred..." (không phải JSON)
        throw new Error(
          res.status >= 500
            ? "Server đang quá tải hoặc khởi động lại, vui lòng thử lại sau 1-2 phút."
            : `Lỗi server (${res.status}): ${rawText.slice(0, 100)}`
        );
      }

      if (!json.success) throw new Error(json.error || "Phân tích thất bại");
      setData(json.data);
      setCachedAt(json.cachedAt || null);
      setFromCache(json.fromCache || false);
      setIsStale(json.stale || false);
    } catch (err: unknown) {
      let message = "Unknown error";
      if (err instanceof DOMException && err.name === "TimeoutError") {
        message = "Kết nối quá lâu (timeout). Backend có thể đang khởi động, vui lòng thử lại sau 1-2 phút.";
      } else if (err instanceof Error) {
        message = err.message;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalysis(false);
  }, [fetchAnalysis]);

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-6 w-full animate-pulse">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="h-32 bg-muted/50 border-none"></Card>
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {[1, 2].map(i => (
            <Card key={i} className="h-64 bg-muted/50 border-none"></Card>
          ))}
        </div>
        <Card className="h-48 bg-muted/50 border-none"></Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full p-6 bg-destructive/10 text-destructive rounded-lg border border-destructive/20 flex flex-col items-center justify-center gap-4">
        <p className="font-semibold">Failed to load market analysis</p>
        <p className="text-sm">{error}</p>
        <Button onClick={() => fetchAnalysis(true)} variant="outline" className="border-destructive/20">
          <RefreshCw className="mr-2 h-4 w-4" /> Try Again
        </Button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        {/* Hiển thị thời gian cache */}
        {cachedAt && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>
              {fromCache ? "Dữ liệu cache từ" : "Cập nhật lúc"}: {formatCachedTime(cachedAt)}
            </span>
            {fromCache && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                isStale
                  ? "bg-orange-500/10 text-orange-500"
                  : "bg-amber-500/10 text-amber-500"
              }`}>
                {isStale ? "STALE CACHE" : "CACHE"}
              </span>
            )}
          </div>
        )}
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => fetchAnalysis(true)} 
          disabled={loading}
          className="text-xs text-muted-foreground"
        >
          {loading ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-2 h-3 w-3" />}
          Refresh AI Analysis
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Trend Card */}
        <Card className="hover:shadow-md transition-all border-none shadow-sm bg-card relative overflow-hidden group">
          <div className={`absolute top-0 left-0 w-1 h-full ${data.marketTrend === 'Bullish' ? 'bg-emerald-500' : data.marketTrend === 'Bearish' ? 'bg-rose-500' : 'bg-amber-500'}`}></div>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Market Trend</CardTitle>
            <div className={`p-2 rounded-full ${data.marketTrend === 'Bullish' ? 'bg-emerald-500/10 text-emerald-500' : data.marketTrend === 'Bearish' ? 'bg-rose-500/10 text-rose-500' : 'bg-amber-500/10 text-amber-500'}`}>
              {data.marketTrend === 'Bullish' ? <TrendingUp className="h-4 w-4" /> : data.marketTrend === 'Bearish' ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{data.marketTrend}</div>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              {data.trendReason}
            </p>
          </CardContent>
        </Card>
        
        {/* Macro Card */}
        <Card className="hover:shadow-md transition-all border-none shadow-sm bg-card relative overflow-hidden group">
          <div className={`absolute top-0 left-0 w-1 h-full ${data.macroImpact === 'Positive' ? 'bg-emerald-500' : data.macroImpact === 'Negative' ? 'bg-rose-500' : 'bg-amber-500'}`}></div>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Macro Impact</CardTitle>
            <div className={`p-2 rounded-full ${data.macroImpact === 'Positive' ? 'bg-emerald-500/10 text-emerald-500' : data.macroImpact === 'Negative' ? 'bg-rose-500/10 text-rose-500' : 'bg-amber-500/10 text-amber-500'}`}>
              {data.macroImpact === 'Positive' ? <TrendingUp className="h-4 w-4" /> : data.macroImpact === 'Negative' ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{data.macroImpact}</div>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              {data.macroReason}
            </p>
          </CardContent>
        </Card>

        {/* AI Suggestion Card */}
        <Card className="hover:shadow-md transition-all border-none shadow-sm bg-card relative overflow-hidden group">
          <div className={`absolute top-0 left-0 w-1 h-full ${data.aiSuggestion === 'Buy' ? 'bg-emerald-500' : data.aiSuggestion === 'Sell' ? 'bg-rose-500' : 'bg-amber-500'}`}></div>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">AI Strategy</CardTitle>
            <div className={`p-2 rounded-full ${data.aiSuggestion === 'Buy' ? 'bg-emerald-500/10 text-emerald-500' : data.aiSuggestion === 'Sell' ? 'bg-rose-500/10 text-rose-500' : 'bg-amber-500/10 text-amber-500'}`}>
              {data.aiSuggestion === 'Buy' ? <TrendingUp className="h-4 w-4" /> : data.aiSuggestion === 'Sell' ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{data.aiSuggestion}</div>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              {data.aiReasoning}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Strong Stocks */}
        <Card className="hover:shadow-md transition-all border-emerald-500/20 bg-emerald-500/5 shadow-sm">
          <CardHeader>
            <CardTitle className="text-emerald-500 flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Strong Stocks (AI Recommended)
            </CardTitle>
            <CardDescription className="text-emerald-500/70">Top picks identified by Gemini.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.strongStocks?.map((stock, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <div className="font-bold text-lg text-emerald-400 group-hover:text-emerald-300 transition-colors">{stock.symbol}</div>
                      <div className="text-sm text-emerald-500/70 truncate max-w-[120px]" title={stock.reason}>{stock.reason}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-emerald-400">{stock.price}</div>
                      <div className="text-sm text-emerald-500 font-medium">+{stock.changePercent}%</div>
                    </div>
                  </div>
                  {i < data.strongStocks.length - 1 && <Separator className="bg-emerald-500/20 my-4" />}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Weak Stocks */}
        <Card className="hover:shadow-md transition-all border-rose-500/20 bg-rose-500/5 shadow-sm">
          <CardHeader>
            <CardTitle className="text-rose-500 flex items-center gap-2">
              <TrendingDown className="h-5 w-5" />
              Weak Stocks (Watch Out)
            </CardTitle>
            <CardDescription className="text-rose-500/70">Stocks facing downward pressure.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.weakStocks?.map((stock, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <div className="font-bold text-lg text-rose-400 group-hover:text-rose-300 transition-colors">{stock.symbol}</div>
                      <div className="text-sm text-rose-500/70 truncate max-w-[120px]" title={stock.reason}>{stock.reason}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-rose-400">{stock.price}</div>
                      <div className="text-sm text-rose-500 font-medium">{stock.changePercent}%</div>
                    </div>
                  </div>
                  {i < data.weakStocks.length - 1 && <Separator className="bg-rose-500/20 my-4" />}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="flex flex-col hover:shadow-md transition-all border-none shadow-sm bg-card">
        <CardHeader>
          <CardTitle>Macro News Recap</CardTitle>
          <CardDescription>
            Latest news summarized by Gemini.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {data.newsRecap?.map((news, i) => (
              <div key={i} className="flex flex-col space-y-2 p-4 rounded-lg bg-muted/30 border border-border/50">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">{news.time}</span>
                </div>
                <p className="text-sm font-semibold text-foreground mt-2 line-clamp-2" title={news.title}>
                  {news.title}
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                  {news.summary}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
