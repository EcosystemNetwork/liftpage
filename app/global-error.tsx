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
      <body style={{ margin: 0, minHeight: "100vh", background: "#12110e", color: "#f3ede3", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ maxWidth: 520, margin: "0 auto", padding: "64px 16px" }}>
          <p style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: "#e4ff3a" }}>LiftPage</p>
          <h1 style={{ fontSize: 32, margin: "12px 0" }}>Something broke on our side.</h1>
          <p style={{ color: "#c8bfaf" }}>It has been reported. Try again, or come back in a minute.</p>
          {error.digest ? <p style={{ fontFamily: "monospace", fontSize: 12, color: "#c8bfaf" }}>Ref {error.digest}</p> : null}
          <button
            type="button"
            onClick={reset}
            style={{ marginTop: 16, minHeight: 40, padding: "0 16px", background: "#e4ff3a", color: "#12110e", border: 0, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.14em", cursor: "pointer" }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
