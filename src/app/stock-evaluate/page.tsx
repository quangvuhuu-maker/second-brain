"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Search, Loader2, TrendingUp, TrendingDown, Minus, ShieldAlert,
  Target, BarChart2, Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Brain, RefreshCw, Clock
} from "lucide-react";

interface TechnicalAnalysis {
  trendScore: number;
  trendComment: string;
  momentumScore: number;
  momentumComment: string;
  volumeScore: number;
  volumeComment: string;
  smcComment: string;
  vsaComment: string;
}

interface FundamentalAnalysis {
  macroScore: number;
  macroComment: string;
  sectorComment: string;
}

interface TradingPlan {
  entryPoint: string;
  dcaPoint: string;
  scaleInPoint: string;
  stopLossPoint: string;
  takeProfitPoint: string;
}

interface Evaluation {
  symbol: string;
  overallScore: number;
  overallRating: string;
  priceTarget: number;
  stopLoss: number;
  technicalAnalysis: TechnicalAnalysis;
  fundamentalAnalysis: FundamentalAnalysis;
  tradingPlan: TradingPlan;
  risks: string[];
  summary: string;
}

interface StockRawData {
  symbol: string;
  price: number;
  changePercent: number;
  volume: number;
  trend: string;
  rsi: number;
  macd: string;
  obvTrend: string;
  bbWidth: string;
  support: number;
  resistance: number;
  smcSignal: string;
  vsaSignal: string;
}

function getScoreColor(score: number): string {
  if (score >= 70) return "text-emerald-500";
  if (score >= 50) return "text-amber-500";
  return "text-rose-500";
}

function getScoreBg(score: number): string {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-rose-500";
}

function getRatingColor(rating: string): string {
  if (rating.includes("Mua mạnh")) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  if (rating.includes("Mua")) return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
  if (rating.includes("Trung lập")) return "text-amber-500 bg-amber-500/10 border-amber-500/20";
  if (rating.includes("Bán mạnh")) return "text-rose-400 bg-rose-500/10 border-rose-500/30";
  if (rating.includes("Bán")) return "text-rose-500 bg-rose-500/10 border-rose-500/20";
  return "text-muted-foreground bg-muted";
}

export default function StockEvaluatePage() {
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [stockData, setStockData] = useState<StockRawData | null>(null);

  const [fromCache, setFromCache] = useState(false);

  const handleEvaluate = async (refresh = false) => {
    if (!symbol.trim()) return;
    setLoading(true);
    setError("");
    if (refresh) {
      setEvaluation(null);
      setStockData(null);
    }
    try {
      const refreshParam = refresh ? "&refresh=true" : "";
      const res = await fetch(`/api/stock-evaluate?symbol=${symbol.trim().toUpperCase()}${refreshParam}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setEvaluation(json.data);
      setStockData(json.stockData);
      setFromCache(json.fromCache || false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500 max-w-7xl mx-auto w-full">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Brain className="h-8 w-8 text-primary" />
          Đánh giá Cổ phiếu
        </h1>
        <p className="text-muted-foreground mt-1">
          Nhập mã cổ phiếu để AI phân tích chi tiết dựa trên SMC, VSA và các chỉ báo kỹ thuật.
        </p>
      </div>

      {/* Search Bar */}
      <div className="flex gap-3 max-w-xl">
        <Input
          placeholder="Nhập mã CP (VD: VCB, FPT, HPG...)"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && handleEvaluate()}
          className="text-lg font-semibold tracking-wider"
        />
        <Button onClick={() => handleEvaluate()} disabled={loading || !symbol.trim()} size="lg">
          {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Search className="mr-2 h-5 w-5" />}
          Đánh giá
        </Button>
        {evaluation && (
          <Button onClick={() => handleEvaluate(true)} disabled={loading} variant="outline" size="lg" title="Phân tích lại (bỏ cache)">
            <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        )}
      </div>

      {/* Cache indicator */}
      {fromCache && evaluation && !loading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground -mt-4">
          <Clock className="h-3 w-3" />
          <span>Kết quả từ cache trong ngày.</span>
          <button onClick={() => handleEvaluate(true)} className="text-primary underline hover:no-underline">Phân tích lại</button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-4 bg-destructive/10 text-destructive rounded-lg border border-destructive/20">
          <p className="font-semibold">Lỗi phân tích</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm">Đang phân tích <span className="font-bold text-foreground">{symbol}</span>... (có thể mất 10-30 giây)</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
            <Card className="lg:col-span-1 h-64 bg-muted/50 border-none"></Card>
            <Card className="lg:col-span-2 h-64 bg-muted/50 border-none"></Card>
            <Card className="lg:col-span-3 h-48 bg-muted/50 border-none"></Card>
          </div>
        </div>
      )}

      {/* Result */}
      {evaluation && stockData && !loading && (
        <div className="space-y-6 animate-in fade-in duration-700">

          {/* Row 1: Overall Score + Raw Data */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Overall Score Card */}
            <Card className="relative overflow-hidden border-none shadow-md">
              <div className={`absolute top-0 left-0 w-full h-1 ${getScoreBg(evaluation.overallScore)}`}></div>
              <CardHeader className="pb-2 text-center">
                <CardTitle className="text-xl">{evaluation.symbol}</CardTitle>
                <CardDescription>Đánh giá tổng quan</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-4">
                {/* Big Score Circle */}
                <div className={`relative w-28 h-28 rounded-full border-4 ${getScoreBg(evaluation.overallScore).replace('bg-', 'border-')} flex items-center justify-center`}>
                  <span className={`text-4xl font-black ${getScoreColor(evaluation.overallScore)}`}>
                    {evaluation.overallScore}
                  </span>
                </div>
                <div className={`px-4 py-1.5 rounded-full border text-sm font-bold ${getRatingColor(evaluation.overallRating)}`}>
                  {evaluation.overallRating}
                </div>
                <div className="grid grid-cols-2 gap-4 w-full mt-2 text-center">
                  <div className="bg-emerald-500/5 rounded-lg p-3 border border-emerald-500/10">
                    <div className="text-xs text-muted-foreground">Mục tiêu</div>
                    <div className="text-lg font-bold text-emerald-500">{evaluation.priceTarget?.toLocaleString('vi-VN')}</div>
                  </div>
                  <div className="bg-rose-500/5 rounded-lg p-3 border border-rose-500/10">
                    <div className="text-xs text-muted-foreground">Cắt lỗ</div>
                    <div className="text-lg font-bold text-rose-500">{evaluation.stopLoss?.toLocaleString('vi-VN')}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Raw Stock Data Card */}
            <Card className="lg:col-span-2 border-none shadow-md">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" /> Dữ liệu Kỹ thuật hiện tại
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Giá hiện tại", value: stockData.price?.toLocaleString('vi-VN'), icon: <Target className="h-4 w-4" /> },
                    { label: "Thay đổi", value: `${stockData.changePercent > 0 ? '+' : ''}${stockData.changePercent}%`, icon: stockData.changePercent >= 0 ? <ArrowUpRight className="h-4 w-4 text-emerald-500" /> : <ArrowDownRight className="h-4 w-4 text-rose-500" /> },
                    { label: "Khối lượng", value: stockData.volume?.toLocaleString('vi-VN'), icon: <BarChart2 className="h-4 w-4" /> },
                    { label: "Xu hướng", value: stockData.trend, icon: stockData.trend === 'Bullish' ? <TrendingUp className="h-4 w-4 text-emerald-500" /> : stockData.trend === 'Bearish' ? <TrendingDown className="h-4 w-4 text-rose-500" /> : <Minus className="h-4 w-4 text-amber-500" /> },
                    { label: "RSI (14)", value: stockData.rsi },
                    { label: "MACD/Signal", value: stockData.macd },
                    { label: "OBV", value: stockData.obvTrend },
                    { label: "Bollinger", value: stockData.bbWidth },
                    { label: "Hỗ trợ", value: stockData.support?.toLocaleString('vi-VN') },
                    { label: "Kháng cự", value: stockData.resistance?.toLocaleString('vi-VN') },
                    { label: "SMC Signal", value: stockData.smcSignal || "None" },
                    { label: "VSA Signal", value: stockData.vsaSignal || "None" },
                  ].map((item, i) => (
                    <div key={i} className="bg-muted/30 rounded-lg p-3 border border-border/50">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                        {item.icon}
                        {item.label}
                      </div>
                      <div className="font-semibold text-sm text-foreground">{item.value}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Row 2: Technical Analysis Scores */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { title: "Xu hướng (Trend)", score: evaluation.technicalAnalysis.trendScore, comment: evaluation.technicalAnalysis.trendComment, icon: <TrendingUp className="h-5 w-5" /> },
              { title: "Động lượng (Momentum)", score: evaluation.technicalAnalysis.momentumScore, comment: evaluation.technicalAnalysis.momentumComment, icon: <Activity className="h-5 w-5" /> },
              { title: "Dòng tiền (Volume)", score: evaluation.technicalAnalysis.volumeScore, comment: evaluation.technicalAnalysis.volumeComment, icon: <BarChart2 className="h-5 w-5" /> },
            ].map((item, i) => (
              <Card key={i} className="border-none shadow-sm hover:shadow-md transition-all">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    {item.icon} {item.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`text-3xl font-black ${getScoreColor(item.score)}`}>{item.score}</span>
                    <span className="text-xs text-muted-foreground">/100</span>
                  </div>
                  <Progress value={item.score} className={`h-2 mb-3 ${getScoreBg(item.score).replace('bg-', '[&>div]:bg-')}`} />
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.comment}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Row 3: SMC + VSA + Macro */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-none shadow-sm border-l-4 border-l-blue-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-blue-500">Smart Money Concept (SMC)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">{evaluation.technicalAnalysis.smcComment}</p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm border-l-4 border-l-purple-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-purple-500">Volume Spread Analysis (VSA)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">{evaluation.technicalAnalysis.vsaComment}</p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm border-l-4 border-l-cyan-500">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-cyan-500">Phân tích Vĩ mô & Ngành</CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xl font-black ${getScoreColor(evaluation.fundamentalAnalysis.macroScore)}`}>
                    {evaluation.fundamentalAnalysis.macroScore}
                  </span>
                  <span className="text-xs text-muted-foreground">/100</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground leading-relaxed">{evaluation.fundamentalAnalysis.macroComment}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{evaluation.fundamentalAnalysis.sectorComment}</p>
              </CardContent>
            </Card>
          </div>

          {/* Row 4: Trading Plan */}
          <Card className="border-none shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" /> Kế hoạch Giao dịch
              </CardTitle>
              <CardDescription>Chiến lược vào lệnh chi tiết dựa trên phân tích SMC/VSA</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { label: "Điểm vào lệnh (Entry)", value: evaluation.tradingPlan.entryPoint, color: "border-emerald-500/30 bg-emerald-500/5" },
                  { label: "Trung bình giá (DCA)", value: evaluation.tradingPlan.dcaPoint, color: "border-amber-500/30 bg-amber-500/5" },
                  { label: "Mua gia tăng (Scale In)", value: evaluation.tradingPlan.scaleInPoint, color: "border-blue-500/30 bg-blue-500/5" },
                  { label: "Cắt lỗ cứng (Stop Loss)", value: evaluation.tradingPlan.stopLossPoint, color: "border-rose-500/30 bg-rose-500/5" },
                  { label: "Chốt lời (Take Profit)", value: evaluation.tradingPlan.takeProfitPoint, color: "border-emerald-500/30 bg-emerald-500/5" },
                ].map((item, i) => (
                  <div key={i} className={`rounded-lg p-4 border ${item.color}`}>
                    <div className="text-xs font-semibold text-muted-foreground mb-2">{item.label}</div>
                    <p className="text-sm text-foreground leading-relaxed">{item.value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Row 5: Risks + Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-none shadow-sm border-rose-500/20 bg-rose-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-rose-500 flex items-center gap-2 text-base">
                  <ShieldAlert className="h-5 w-5" /> Rủi ro cần lưu ý
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {evaluation.risks?.map((risk, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <AlertTriangle className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />
                      {risk}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm border-primary/20 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-primary flex items-center gap-2 text-base">
                  <Brain className="h-5 w-5" /> Tổng kết AI
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">{evaluation.summary}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
