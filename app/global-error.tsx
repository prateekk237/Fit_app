"use client";

/**
 * Last-line defence: used when the error happens inside the root
 * layout itself (before any providers mount). Must render a complete
 * html/body.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
          fontFamily: "system-ui, sans-serif",
          color: "#0f172a",
          background: "#fafafa",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 400 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
            Fit is offline for a moment
          </h1>
          <p style={{ fontSize: 14, color: "#64748b", marginBottom: 24 }}>
            Something broke before the app could start. Your data is safe.
          </p>
          {error.digest && (
            <code
              style={{
                fontSize: 11,
                background: "#f1f5f9",
                padding: "2px 8px",
                borderRadius: 6,
                color: "#475569",
              }}
            >
              ref {error.digest}
            </code>
          )}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              display: "block",
              margin: "24px auto 0",
              padding: "8px 16px",
              borderRadius: 8,
              background: "#0f172a",
              color: "white",
              fontWeight: 600,
              border: 0,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
