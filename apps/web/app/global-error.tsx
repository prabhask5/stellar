"use client";

/**
 * Last resort: the root layout itself failed. Rendered without the app's styles or
 * components, so everything it needs is inline (colours from ui-tokens: bg.void,
 * text.primary, text.secondary, accent, accent.ink).
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#070615",
          color: "#F5F3FF",
          font: "17px/22px -apple-system, BlinkMacSystemFont, Inter, system-ui, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, lineHeight: "28px", margin: 0 }}>
            Stellar Planner hit a problem
          </h1>
          <p style={{ color: "#ABA6CC", margin: "8px 0 20px" }}>
            Your data is safe. Reload to carry on.
          </p>
          <button
            type="button"
            onClick={() => {
              reset();
              window.location.reload();
            }}
            style={{
              height: 44,
              padding: "0 20px",
              borderRadius: 12,
              border: 0,
              background: "#F6C76E",
              color: "#1A1206",
              font: "inherit",
              fontWeight: 600,
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
