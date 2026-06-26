import { NextResponse } from "next/server";

// Route để Vercel Cron ping Render backend mỗi 10 phút → tránh cold start
export async function GET() {
  const backendUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!backendUrl || backendUrl.includes("127.0.0.1")) {
    return NextResponse.json({ ok: false, note: "Skipping — local dev environment" });
  }

  try {
    const start = Date.now();
    const res = await fetch(`${backendUrl}/api/market/news`, {
      signal: AbortSignal.timeout(10000),
    });
    const elapsed = Date.now() - start;
    console.log(`[KeepWarm] Backend ping: ${res.status} in ${elapsed}ms`);

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      elapsed: `${elapsed}ms`,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.warn("[KeepWarm] Backend ping failed:", err.message);
    return NextResponse.json({ ok: false, error: err.message });
  }
}
