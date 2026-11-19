import { ImageResponse } from "next/og";

/** Share card for links on X, LinkedIn, iMessage and Slack. Next adds the og:image and twitter:image tags. */
export const alt = "LiftPage: Attention into traction.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          background: "#f5f2ec",
          color: "#17150f",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 26, letterSpacing: 6, color: "#b93d0b", fontFamily: "monospace" }}>
          DIGITAL MEDIA FOR STARTUPS
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 136, lineHeight: 1, letterSpacing: -3 }}>
          <span>Attention into</span>
          <span style={{ color: "#b93d0b", fontStyle: "italic" }}>traction.</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 34 }}>
          <span>LiftPage</span>
          <span style={{ color: "#4f4a42" }}>liftpage.co</span>
        </div>
      </div>
    ),
    size,
  );
}
