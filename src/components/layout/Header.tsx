"use client";

import { useState, useRef, useEffect } from "react";
import { Search, User, LogOut, UserCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";

export function Header() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-background px-4 lg:h-[60px] lg:px-6 sticky top-0 z-10">
      <div className="w-full flex-1">
        <form>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Ask anything..."
              className="w-full appearance-none bg-muted/50 pl-8 shadow-none md:w-2/3 lg:w-1/3 border-none focus-visible:ring-1"
            />
          </div>
        </form>
      </div>
      <div className="flex items-center gap-4">
        <ThemeToggle />
        
        <div className="relative" ref={dropdownRef}>
          <div 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 cursor-pointer hover:bg-primary/20 transition-colors overflow-hidden"
          >
            {user?.photoURL ? (
              <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <User className="h-5 w-5 text-primary" />
            )}
          </div>
          
          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-md border bg-popover text-popover-foreground shadow-md z-50 animate-in fade-in-0 zoom-in-95">
              <div className="flex flex-col space-y-1 px-4 py-3 border-b">
                <p className="text-sm font-medium leading-none">{user?.displayName || "User"}</p>
                <p className="text-xs leading-none text-muted-foreground mt-1">
                  {user?.email}
                </p>
              </div>
              <div className="p-1">
                <div 
                  onClick={() => { setIsDropdownOpen(false); router.push("/profile"); }}
                  className="relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  <UserCircle className="h-4 w-4" />
                  <span>Trang cá nhân</span>
                </div>
                <div 
                  onClick={() => { setIsDropdownOpen(false); logout(); }}
                  className="relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-destructive/10 text-destructive mt-1"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Đăng xuất</span>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </header>
  );
}
