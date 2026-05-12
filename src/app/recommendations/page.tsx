"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TrendingUp, TrendingDown, RefreshCw, Loader2, Target, BarChart2, BookOpen, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Recommendation {
  symbol: string;
  currentPrice: number;
  entryPrice?: number;
  sellPrice?: number;
  targetPrice: number;
  stopLossPrice?: number;
  upsidePercent?: number;
  downsidePercent?: number;
  technicalReason: string;
  fundamentalReason: string;
}

interface DeepAnalysis {
  topBuys: Recommendation[];
  topSells: Recommendation[];
}

function formatCachedTime(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  } catch {
    return isoStr;
  }
}

export default function RecommendationsPage() {
  const [data, setData] = useState<DeepAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const fetchAnalysis = async (refresh = false) => {
    setLoading(true);
    setError("");
    try {
      const url = refresh ? "/api/deep-recommendations?refresh=true" : "/api/deep-recommendations";
      const res = await fetch(url);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setData(json.data);
      setCachedAt(json.cachedAt || null);
      setFromCache(json.fromCache || false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalysis(false);
  }, []);

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500 max-w-7xl mx-auto w-full">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <Target className="h-8 w-8 text-primary" />
              Deep Recommendations
            </h1>
            <p className="text-muted-foreground mt-1">
              Top 10 Buy & Sell picks from HSX, HNX, UPCOM analyzed by AI based on Technicals and Fundamentals.
            </p>
          </div>
          <Button onClick={() => fetchAnalysis(true)} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Generate Analysis
          </Button>
        </div>

        {/* Thời gian cache */}
        {cachedAt && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>
              {fromCache ? "Dữ liệu cache từ" : "Cập nhật lúc"}: {formatCachedTime(cachedAt)}
            </span>
            {fromCache && (
              <span className="bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded-full text-[10px] font-medium">
                CACHE
              </span>
            )}
          </div>
        )}

        {error && (
          <div className="p-6 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
            <p className="font-semibold">Analysis Failed</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {loading && !data && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-pulse">
            <Card className="h-[600px] bg-muted/50 border-none"></Card>
            <Card className="h-[600px] bg-muted/50 border-none"></Card>
          </div>
        )}

        {!loading && data && (
          <Tabs defaultValue="buy" className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-2 mb-8">
              <TabsTrigger value="buy" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-500">
                <TrendingUp className="mr-2 h-4 w-4" /> Top 10 Buys
              </TabsTrigger>
              <TabsTrigger value="sell" className="data-[state=active]:bg-rose-500/20 data-[state=active]:text-rose-500">
                <TrendingDown className="mr-2 h-4 w-4" /> Top 10 Sells
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="buy" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {data.topBuys.map((stock, i) => (
                  <Card key={i} className="border-emerald-500/20 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-2xl font-bold text-emerald-500 flex items-center gap-2">
                            {stock.symbol}
                          </CardTitle>
                          <CardDescription className="mt-1">
                            Current: <span className="font-medium text-foreground">{stock.currentPrice.toLocaleString('vi-VN')} VND</span>
                          </CardDescription>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-muted-foreground">Mua: <span className="text-foreground font-semibold">{stock.entryPrice?.toLocaleString('vi-VN')}</span></div>
                          <div className="text-sm text-muted-foreground mt-1">Chốt lời: <span className="text-emerald-500 font-bold">{stock.targetPrice?.toLocaleString('vi-VN')}</span></div>
                          <div className="text-sm text-muted-foreground mt-1">Cắt lỗ: <span className="text-rose-500 font-semibold">{stock.stopLossPrice?.toLocaleString('vi-VN')}</span></div>
                        </div>
                      </div>
                      <div className="mt-4 space-y-1">
                        <div className="flex justify-between text-xs font-medium">
                          <span className="text-emerald-500/70">Expected Upside</span>
                          <span className="text-emerald-500">+{stock.upsidePercent}%</span>
                        </div>
                        <Progress value={stock.upsidePercent ? Math.min(stock.upsidePercent * 2, 100) : 0} className="h-2 bg-emerald-500/10 [&>div]:bg-emerald-500" />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-2">
                      <div className="bg-muted/30 p-3 rounded-md">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-1">
                          <BarChart2 className="h-4 w-4 text-emerald-500" /> Technical Analysis
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{stock.technicalReason}</p>
                      </div>
                      <div className="bg-muted/30 p-3 rounded-md">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-1">
                          <BookOpen className="h-4 w-4 text-emerald-500" /> Fundamental Catalyst
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{stock.fundamentalReason}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="sell" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {data.topSells.map((stock, i) => (
                  <Card key={i} className="border-rose-500/20 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
                    <div className="absolute top-0 left-0 w-1 h-full bg-rose-500"></div>
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-2xl font-bold text-rose-500 flex items-center gap-2">
                            {stock.symbol}
                          </CardTitle>
                          <CardDescription className="mt-1">
                            Current: <span className="font-medium text-foreground">{stock.currentPrice.toLocaleString('vi-VN')} VND</span>
                          </CardDescription>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-muted-foreground">Bán/Cắt: <span className="text-foreground font-semibold">{stock.sellPrice?.toLocaleString('vi-VN')}</span></div>
                          <div className="text-sm text-muted-foreground mt-1">Chờ Cover: <span className="text-rose-400 font-bold">{stock.targetPrice?.toLocaleString('vi-VN')}</span></div>
                        </div>
                      </div>
                      <div className="mt-4 space-y-1">
                        <div className="flex justify-between text-xs font-medium">
                          <span className="text-rose-500/70">Expected Downside</span>
                          <span className="text-rose-500">-{stock.downsidePercent}%</span>
                        </div>
                        <Progress value={stock.downsidePercent ? Math.min(stock.downsidePercent * 2, 100) : 0} className="h-2 bg-rose-500/10 [&>div]:bg-rose-500" />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-2">
                      <div className="bg-muted/30 p-3 rounded-md">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-1">
                          <BarChart2 className="h-4 w-4 text-rose-500" /> Technical Risk
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{stock.technicalReason}</p>
                      </div>
                      <div className="bg-muted/30 p-3 rounded-md">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-1">
                          <BookOpen className="h-4 w-4 text-rose-500" /> Fundamental Risk
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">{stock.fundamentalReason}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
  );
}
