import { AdhocTaskWidget } from "@/components/dashboard/AdhocTaskWidget";
import { MarketAnalysis } from "@/components/dashboard/MarketAnalysis";

export default function Home() {
  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Overview</h1>
          <p className="text-muted-foreground mt-1">Here's what's happening with your investments and tasks today.</p>
        </div>
      </div>

      {/* AI Automated Market Analysis Section */}
      <MarketAnalysis />

      {/* Ad-hoc Task Widget */}
      <div className="grid grid-cols-1 mt-4">
        <AdhocTaskWidget />
      </div>
    </div>
  );
}
