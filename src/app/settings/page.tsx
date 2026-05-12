"use client";

import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Save, Loader2, Check, Key } from "lucide-react";
import { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function SettingsPage() {
  const { user } = useAuth();
  const [apiKeys, setApiKeys] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSettings() {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, "settings", "api_keys"));
        if (snap.exists()) {
          const d = snap.data();
          if (d.geminiKeys && Array.isArray(d.geminiKeys)) {
            setApiKeys(d.geminiKeys.join("\n"));
          }
        }
      } catch (err) {
        console.error("Load settings error:", err);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError("");
    setSaved(false);
    
    try {
      const keysArray = apiKeys
        .split("\n")
        .map(k => k.trim())
        .filter(k => k.length > 0);
        
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          keysArray,
          uid: user.uid
        })
      });
      
      const json = await res.json();
      
      if (!json.success) {
        throw new Error(json.error || "Failed to save settings");
      }
      
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
      setError("Không thể lưu API Keys. Vui lòng thử lại hoặc kiểm tra quyền truy cập.");
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="flex flex-col items-center py-8 px-4 animate-in fade-in duration-500">
      <div className="w-full max-w-2xl space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Hệ thống Settings</h2>
          <p className="text-muted-foreground mt-2">Quản lý cấu hình toàn cục cho Second Brain</p>
        </div>

        <Card className="border shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              Gemini API Keys
            </CardTitle>
            <CardDescription>
              Nhập danh sách các Gemini API Keys để hệ thống xoay vòng (Rotation) khi gặp giới hạn Quota. 
              Nhập mỗi key trên một dòng.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <>
                <div className="space-y-2">
                  <textarea 
                    value={apiKeys} 
                    onChange={e => setApiKeys(e.target.value)} 
                    placeholder="AIzaSy...\nAIzaSy...\nAIzaSy..." 
                    rows={6}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y font-mono" 
                  />
                </div>
                {error && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">{error}</p>}
                <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto h-11 px-8 text-base font-medium">
                  {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Đang lưu...</>
                   : saved ? <><Check className="mr-2 h-4 w-4" />Đã lưu thành công!</>
                   : <><Save className="mr-2 h-4 w-4" />Lưu API Keys</>}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
