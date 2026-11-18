"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/** Last resort: the root layout itself failed. Replaces the whole document. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", background: "#f5f2ec", color: "#17150f", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ maxWidth: 520, margin: "0 auto", padding: "64px 16px" }}>
          <p style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "#c2410c" }}>LiftPage</p>
          <h1 style={{ fontSize: 40, margin: "12px 0", fontFamily: "Georgia, serif", fontWeight: 400 }}>Something broke on our side.</h1>
          <p style={{ color: "#655f55" }}>It has been reported. Try again, or come back in a minute.</p>
          {error.digest ? <p style={{ fontFamily: "monospace", fontSize: 12, color: "#655f55" }}>Ref {error.digest}</p> : null}
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 16, minHeight: 40, padding: "0 16px", background: "#17150f", color: "#f5f2ec", border: 0, borderRadius: 999, fontSize: 14, fontWeight: 500, cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
