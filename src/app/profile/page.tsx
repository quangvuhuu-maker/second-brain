"use client";

import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LogOut, ShieldAlert, ShieldCheck, User as UserIcon, Save, Loader2, Check } from "lucide-react";
import { useState, useEffect } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function ProfilePage() {
  const { user, userStatus, logout } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    async function loadProfile() {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          const d = snap.data();
          setDisplayName(d.displayName || d.name || user.displayName || "");
          setPhone(d.phone || "");
          setBio(d.bio || "");
        } else {
          setDisplayName(user.displayName || "");
        }
      } catch (err) {
        console.error("Load profile error:", err);
      } finally {
        setLoadingProfile(false);
      }
    }
    loadProfile();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await updateDoc(doc(db, "users", user.uid), {
        displayName: displayName.trim(),
        phone: phone.trim(),
        bio: bio.trim(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Không thể lưu. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="flex flex-col items-center py-8 px-4 animate-in fade-in duration-500">
      <div className="w-full max-w-lg space-y-6">
        <div className="flex flex-col items-center text-center">
          <div className="h-24 w-24 rounded-full overflow-hidden bg-primary/10 border-4 border-background shadow-lg mb-4 flex items-center justify-center">
            {user.photoURL ? (
              <img src={user.photoURL} alt="Avatar" className="h-full w-full object-cover" />
            ) : (
              <UserIcon className="h-12 w-12 text-primary" />
            )}
          </div>
          <h2 className="text-2xl font-bold tracking-tight">{displayName || user.displayName || "No Name"}</h2>
          <p className="text-sm text-muted-foreground mt-1">{user.email}</p>
        </div>

        <Card className="border shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Trạng thái tài khoản:</span>
              {userStatus === "approved" ? (
                <span className="flex items-center text-emerald-500 font-semibold text-sm bg-emerald-500/10 px-3 py-1 rounded-full">
                  <ShieldCheck className="w-4 h-4 mr-1.5" />Đã phê duyệt
                </span>
              ) : (
                <span className="flex items-center text-amber-500 font-semibold text-sm bg-amber-500/10 px-3 py-1 rounded-full">
                  <ShieldAlert className="w-4 h-4 mr-1.5" />Chờ phê duyệt
                </span>
              )}
            </div>
            {userStatus === "pending" && (
              <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                Tài khoản đang chờ Admin phê duyệt. Vui lòng liên hệ Admin.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader><CardTitle className="text-lg">Chỉnh sửa thông tin</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            {loadingProfile ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <div className="space-y-2">
                  <label htmlFor="pn" className="text-sm font-medium">Tên hiển thị</label>
                  <Input id="pn" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Nhập tên..." className="h-11" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="pp" className="text-sm font-medium">Số điện thoại</label>
                  <Input id="pp" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0901234567" className="h-11" />
                </div>
                <div className="space-y-2">
                  <label htmlFor="pb" className="text-sm font-medium">Giới thiệu</label>
                  <textarea id="pb" value={bio} onChange={e => setBio(e.target.value)} placeholder="Vài dòng về bạn..." rows={3}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none" />
                </div>
                {error && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>}
                <Button onClick={handleSave} disabled={saving} className="w-full h-11 text-base font-medium">
                  {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Đang lưu...</>
                   : saved ? <><Check className="mr-2 h-4 w-4" />Đã lưu!</>
                   : <><Save className="mr-2 h-4 w-4" />Lưu thay đổi</>}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border shadow-sm border-destructive/20">
          <CardContent className="pt-6">
            <Button variant="destructive" className="w-full h-11 text-base font-medium" onClick={logout}>
              <LogOut className="mr-2 h-5 w-5" />Đăng xuất
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
