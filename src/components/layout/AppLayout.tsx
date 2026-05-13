"use client";

import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { useAuth } from "@/context/AuthContext";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2, LogOut, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, userStatus, loading, logout } = useAuth();
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

  // Chặn user nếu chưa được duyệt (status !== "approved")
  if (userStatus === "pending" || userStatus === null) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-background p-4">
        <div className="max-w-md w-full p-8 bg-card rounded-xl shadow-sm border border-border flex flex-col items-center text-center space-y-6">
          <div className="w-16 h-16 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center mb-2">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight mb-2">Tài khoản chờ phê duyệt</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Tài khoản của bạn (<span className="font-medium text-foreground">{user.email}</span>) đã được ghi nhận nhưng cần được Quản trị viên cấp quyền trước khi có thể truy cập vào hệ thống.
            </p>
          </div>
          <Button onClick={logout} variant="outline" className="w-full mt-4">
            <LogOut className="mr-2 h-4 w-4" />
            Đăng xuất
          </Button>
        </div>
      </div>
    );
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
