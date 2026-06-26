"use client";

// global-error.tsx: Override Next.js 16 global error boundary
// Không có file này → Next.js tự generate /_global-error và bị lỗi prerender (workStore invariant)
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <h2>Đã xảy ra lỗi không mong muốn.</h2>
          <button onClick={() => reset()}>Thử lại</button>
        </div>
      </body>
    </html>
  );
}
