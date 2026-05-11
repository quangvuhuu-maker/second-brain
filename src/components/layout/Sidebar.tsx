import Link from "next/link";
import { LayoutDashboard, Target, Activity, Settings, TrendingUp } from "lucide-react";

export function Sidebar() {
  return (
    <aside className="hidden w-64 flex-col border-r bg-background md:flex">
      <div className="flex h-14 items-center border-b px-4 lg:h-[60px] lg:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold text-primary">
          <Activity className="h-6 w-6" />
          <span className="text-lg">Second Brain</span>
        </Link>
      </div>
      <div className="flex-1 overflow-auto py-4">
        <nav className="grid items-start px-2 text-sm font-medium lg:px-4 gap-2">
          <Link
            href="/"
            className="flex items-center gap-3 rounded-lg bg-primary/10 px-3 py-2.5 text-primary transition-all hover:bg-primary/20"
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
          <Link
            href="/recommendations"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
          >
            <TrendingUp className="h-4 w-4" />
            AI Recommendations
          </Link>
          <Link
            href="/tasks"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
          >
            <Target className="h-4 w-4" />
            Ad-hoc Tasks
          </Link>
          <Link
            href="/settings"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </nav>
      </div>
    </aside>
  );
}
