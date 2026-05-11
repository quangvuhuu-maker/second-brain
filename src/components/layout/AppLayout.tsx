"use client";

import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useAuth } from "@/context/AuthContext";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user && pathname !== "/login") {
      router.push("/login");
    }
  }, [user, loading, pathname, router]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Nếu chưa đăng nhập và đang ở trang login, chỉ render children (Màn hình login)
  if (!user && pathname === "/login") {
    return <>{children}</>;
  }

  // Nếu chưa đăng nhập mà ở trang khác, ẩn UI (sẽ bị hook useEffect đá về login)
  if (!user) {
    return null;
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="flex-1 p-4 lg:p-8 bg-muted/20">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
