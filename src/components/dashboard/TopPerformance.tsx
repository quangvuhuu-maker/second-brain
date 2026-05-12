"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Clock, Loader2, Info } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface TopStock {
  type: "BUY" | "SELL";
  symbol: string;
  baselineDate: string;
  baselinePrice: number;
  currentPrice: number;
  plPercent: number;
  daysSince: number;
  additionalNote: string | null;
}

export function TopPerformance() {
  const [data, setData] = useState<TopStock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTop = async () => {
      try {
        const res = await fetch("/api/top-performance");
        const json = await res.json();
        if (json.success) setData(json.data);
      } catch (err) {
        console.error("Top performance error:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchTop();
  }, []);

  if (loading) {
    return (
      <Card className="col-span-full animate-pulse border-none shadow-sm">
        <CardHeader><CardTitle className="bg-muted h-6 w-48 rounded"></CardTitle></CardHeader>
        <CardContent className="h-64 bg-muted/50 rounded-b-xl"></CardContent>
      </Card>
    );
  }

  if (data.length === 0) return null;

  return (
    <Card className="col-span-full border-none shadow-sm overflow-hidden bg-card/50 backdrop-blur-sm">
      <CardHeader className="border-b bg-gradient-to-r from-primary/5 to-transparent">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Top 10 Khuyến Nghị Hiệu Quả Nhất
        </CardTitle>
        <CardDescription>Danh sách các mã cổ phiếu AI khuyến nghị có tỷ suất lợi nhuận cao nhất tính đến nay.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-muted-foreground">
                <th className="py-3 px-4 text-left font-medium">Mã / Loại</th>
                <th className="py-3 px-4 text-right font-medium">Ngày KN đầu tiên</th>
                <th className="py-3 px-4 text-right font-medium">Giá KN</th>
                <th className="py-3 px-4 text-right font-medium">Giá hiện tại</th>
                <th className="py-3 px-4 text-right font-medium">Hiệu quả</th>
              </tr>
            </thead>
            <tbody>
              {data.map((stock, i) => {
                const isBuy = stock.type === "BUY";
                return (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/10 transition-colors group">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className={`font-bold text-base ${isBuy ? "text-emerald-500" : "text-rose-500"}`}>
                          {stock.symbol}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${isBuy ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"}`}>
                          {isBuy ? "MUA" : "BÁN"}
                        </span>
                        {stock.additionalNote && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <div className="p-1 rounded-full bg-amber-500/20 text-amber-600 cursor-help">
                                  <Info className="h-3 w-3" />
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="max-w-[200px] text-xs">
                                {stock.additionalNote}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right text-muted-foreground">
                      <div className="flex items-center justify-end gap-1.5">
                        <Clock className="h-3 w-3" />
                        {stock.baselineDate}
                        <span className="text-xs">({stock.daysSince} ngày)</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-medium">{stock.baselinePrice?.toLocaleString("vi-VN")}</td>
                    <td className="py-3 px-4 text-right font-medium">{stock.currentPrice?.toLocaleString("vi-VN")}</td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-500">
                      +{stock.plPercent?.toFixed(2)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
