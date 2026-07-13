"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TrendingUp, TrendingDown, RefreshCw, Loader2, Target, BarChart2, BookOpen, Clock, ShieldAlert, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

interface Recommendation {
  symbol: string;
  currentPrice: number;
  entryPrice?: number;
  sellPrice?: number;
  stopLoss?: number;
  stopLossPoint?: string;
  entryPointDesc?: string;
  dcaPoint?: string;
  scaleInPoint?: string;
  proximityTier?: "A" | "B" | "C";
  proximityPct?: number | null;
  // 3-tier targets for buys
  targetShort?: number;
  upsideShort?: number;
  targetMedium?: number;
  upsideMedium?: number;
  targetLong?: number;
  upsideLong?: number;
  // 3-tier targets for sells
  downsideShort?: number;
  downsideMedium?: number;
  downsideLong?: number;
  // Legacy fields (fallback)
  targetPrice?: number;
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

function fmt(n: number | undefined): string {
  if (!n) return "—";
  return n.toLocaleString("vi-VN");
}

/**
 * Badge hiển thị tier proximity so với vùng support.
 * Tier A (≤3%): mã đang ở tại/test support → có thể vào ngay
 * Tier B (≤8%): gần support → chờ pullback
 * Tier C (>8%): xa support → momentum entry
 */
function ProximityBadge({
  tier,
  pct,
}: {
  tier?: "A" | "B" | "C";
  pct?: number | null;
}) {
  if (!tier) return null;

  if (tier === "A") {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        Tại Support{pct != null ? ` (≤3%)` : ""}
      </div>
    );
  }
  if (tier === "B") {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
        <span className="w-2 h-2 rounded-full bg-amber-400" />
        Gần Support{pct != null ? ` (${pct.toFixed(1)}%)` : ""}
      </div>
    );
  }
  // Tier C
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
      <span className="w-2 h-2 rounded-full bg-blue-400" />
      Momentum{pct != null ? ` (${pct.toFixed(1)}%)` : ""}
    </div>
  );
}

const SHORT_TERM_UPSIDE_THRESHOLD = 5; // % — dưới ngưỡng này coi là không hấp dẫn

function UpsideBadge({
  label,
  percent,
  target,
  color,
  currentPrice,
  isShortTerm = false,
}: {
  label: string;
  percent?: number;
  target?: number;
  color: string;
  currentPrice?: number;
  isShortTerm?: boolean;
}) {
  if (!percent && !target) return null;

  const colorMap: Record<string, string> = {
    short: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    medium: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    long: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  };

  // Option C: tính upside thực tế từ giá hiện tại (không phải từ entry)
  const actualUpside =
    isShortTerm && currentPrice && target
      ? ((target - currentPrice) / currentPrice) * 100
      : null;
  const isLowUpside = actualUpside !== null && actualUpside < SHORT_TERM_UPSIDE_THRESHOLD;

  return (
    <div className={`relative rounded-lg border p-2 text-center transition-opacity ${colorMap[color]} ${isLowUpside ? "opacity-50" : ""}`}>
      <div className="text-[10px] font-medium opacity-70 mb-0.5">{label}</div>
      <div className="font-bold text-sm">{target ? fmt(target) : "—"}</div>
      {percent !== undefined && percent > 0 && (
        <div className="text-[11px] font-semibold mt-0.5">+{percent.toFixed(1)}%</div>
      )}
      {/* Overlay cảnh báo khi upside thấp */}
      {isLowUpside && (
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-amber-500/15 border border-amber-500/40 backdrop-blur-[1px]">
          <AlertTriangle className="h-3 w-3 text-amber-400 mb-0.5" />
          <span className="text-[9px] font-bold text-amber-400 leading-tight text-center px-1">
            Upside thấp
            {actualUpside !== null ? ` (${actualUpside.toFixed(1)}%)` : ""}
          </span>
        </div>
      )}
    </div>
  );
}

function DownsideBadge({ label, percent, target, color }: { label: string; percent?: number; target?: number; color: string }) {
  if (!percent && !target) return null;
  const colorMap: Record<string, string> = {
    short: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    medium: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    long: "bg-red-600/10 text-red-400 border-red-600/20",
  };
  return (
    <div className={`rounded-lg border p-2 text-center ${colorMap[color]}`}>
      <div className="text-[10px] font-medium opacity-70 mb-0.5">{label}</div>
      <div className="font-bold text-sm">{target ? fmt(target) : "—"}</div>
      {percent !== undefined && percent > 0 && (
        <div className="text-[11px] font-semibold mt-0.5">-{percent.toFixed(1)}%</div>
      )}
    </div>
  );
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
      const res = await fetch(url, {
        signal: AbortSignal.timeout(90000),
      });

      const rawText = await res.text();
      let json: any;
      try {
        json = JSON.parse(rawText);
      } catch {
        throw new Error(
          res.status >= 500
            ? "Server đang quá tải hoặc khởi động lại, vui lòng thử lại sau 1-2 phút."
            : `Lỗi server (${res.status}): ${rawText.slice(0, 100)}`
        );
      }

      if (!json.success) throw new Error(json.error);
      setData(json.data);
      setCachedAt(json.cachedAt || null);
      setFromCache(json.fromCache || false);
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
            Top 10 Buy &amp; Sell picks — Entry an toàn + 3 mức mục tiêu Ngắn / Trung / Dài hạn.
          </p>
        </div>
        <Button onClick={() => fetchAnalysis(true)} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Generate Analysis
        </Button>
      </div>

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

          {/* ── TOP BUYS ── */}
          <TabsContent value="buy" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {data.topBuys.map((stock, i) => (
                <Card key={i} className="border-emerald-500/20 shadow-sm hover:shadow-md transition-all relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-2xl font-bold text-emerald-500">{stock.symbol}</CardTitle>
                        <CardDescription className="mt-1">
                          Giá hiện tại: <span className="font-semibold text-foreground">{fmt(stock.currentPrice)} VND</span>
                        </CardDescription>
                        <div className="mt-1.5">
                          <ProximityBadge tier={stock.proximityTier} pct={stock.proximityPct} />
                        </div>
                      </div>
                      <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 text-xs">MUA</Badge>
                    </div>

                    {/* Entry & Stop Loss */}
                    <div className="mt-4 grid grid-cols-2 gap-3 bg-muted/20 p-3 rounded-lg border border-border/50">
                      <div className="space-y-1">
                        <span className="text-muted-foreground text-xs font-medium block">
                          📍 Điểm vào
                          {stock.entryPrice && stock.currentPrice && stock.entryPrice !== stock.currentPrice && (
                            <span className="ml-1.5 text-[10px] text-muted-foreground/70">
                              (cách giá {(Math.abs((stock.currentPrice - stock.entryPrice) / stock.currentPrice) * 100).toFixed(1)}%)
                            </span>
                          )}
                        </span>
                        <span className="font-bold text-emerald-400 text-sm">
                          {stock.entryPrice ? fmt(stock.entryPrice) : "—"} VND
                        </span>
                        <span className="text-muted-foreground text-[11px] block">{stock.entryPointDesc || ""}</span>
                      </div>
                      <div className="space-y-1">
                        <span className="text-rose-400/70 text-xs font-medium block flex items-center gap-1">
                          <ShieldAlert className="h-3 w-3" /> Stop Loss
                        </span>
                        <span className="font-bold text-rose-400 text-sm">
                          {stock.stopLoss ? fmt(stock.stopLoss) : "—"} VND
                        </span>
                        <span className="text-muted-foreground text-[11px] block">{stock.stopLossPoint || ""}</span>
                      </div>
                      {stock.dcaPoint && (
                        <div className="space-y-1">
                          <span className="text-muted-foreground text-xs font-medium block">🔄 DCA</span>
                          <span className="text-foreground text-xs">{stock.dcaPoint}</span>
                        </div>
                      )}
                      {stock.scaleInPoint && (
                        <div className="space-y-1">
                          <span className="text-muted-foreground text-xs font-medium block">📈 Scale In</span>
                          <span className="text-foreground text-xs">{stock.scaleInPoint}</span>
                        </div>
                      )}
                    </div>

                    {/* 3 Target levels */}
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground font-medium mb-2">🎯 Mục tiêu giá</p>
                      <div className="grid grid-cols-3 gap-2">
                        <UpsideBadge
                          label="Ngắn hạn (1-4w)"
                          percent={stock.upsideShort ?? stock.upsidePercent}
                          target={stock.targetShort ?? stock.targetPrice}
                          color="short"
                          currentPrice={stock.currentPrice}
                          isShortTerm
                        />
                        <UpsideBadge
                          label="Trung hạn (1-3m)"
                          percent={stock.upsideMedium}
                          target={stock.targetMedium}
                          color="medium"
                        />
                        <UpsideBadge
                          label="Dài hạn (3-6m)"
                          percent={stock.upsideLong}
                          target={stock.targetLong}
                          color="long"
                        />
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 pt-2">
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

          {/* ── TOP SELLS ── */}
          <TabsContent value="sell" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {data.topSells.map((stock, i) => (
                <Card key={i} className="border-rose-500/20 shadow-sm hover:shadow-md transition-all relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-rose-500" />
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-2xl font-bold text-rose-500">{stock.symbol}</CardTitle>
                        <CardDescription className="mt-1">
                          Giá hiện tại: <span className="font-semibold text-foreground">{fmt(stock.currentPrice)} VND</span>
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className="text-rose-400 border-rose-500/30 text-xs">BÁN</Badge>
                    </div>

                    {/* Sell price & stop */}
                    <div className="mt-4 grid grid-cols-2 gap-3 bg-muted/20 p-3 rounded-lg border border-border/50">
                      <div className="space-y-1">
                        <span className="text-muted-foreground text-xs font-medium block">📍 Giá bán / cắt</span>
                        <span className="font-bold text-rose-400 text-sm">
                          {stock.sellPrice ? fmt(stock.sellPrice) : "—"} VND
                        </span>
                      </div>
                      {stock.stopLoss && (
                        <div className="space-y-1">
                          <span className="text-amber-400/70 text-xs font-medium block">⚠️ Mua lại cover</span>
                          <span className="font-bold text-amber-400 text-sm">{fmt(stock.stopLoss)} VND</span>
                        </div>
                      )}
                    </div>

                    {/* 3 Downside levels */}
                    <div className="mt-3">
                      <p className="text-xs text-muted-foreground font-medium mb-2">📉 Mục tiêu giảm</p>
                      <div className="grid grid-cols-3 gap-2">
                        <DownsideBadge
                          label="Ngắn hạn (1-4w)"
                          percent={stock.downsideShort ?? stock.downsidePercent}
                          target={stock.targetShort ?? stock.targetPrice}
                          color="short"
                        />
                        <DownsideBadge
                          label="Trung hạn (1-3m)"
                          percent={stock.downsideMedium}
                          target={stock.targetMedium}
                          color="medium"
                        />
                        <DownsideBadge
                          label="Dài hạn (3-6m)"
                          percent={stock.downsideLong}
                          target={stock.targetLong}
                          color="long"
                        />
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3 pt-2">
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
