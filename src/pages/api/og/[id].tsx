import { ImageResponse } from "next/og";
import { getTweetById } from "@/lib/db";

export const config = { runtime: "edge" };

export default async function handler(req: Request) {
  try {
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const id = segments[segments.length - 1];

    if (!id || !/^\d+$/.test(id)) {
      return new Response("Invalid id", { status: 400 });
    }

    const tweet = await getTweetById(id);
    if (!tweet) {
      return new Response("Not found", { status: 404 });
    }

    const rawText = tweet.text ?? "";
    const text = rawText.length > 240 ? rawText.slice(0, 237) + "..." : rawText;
    const dateStr = new Date(tweet.createdAt).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    // Scale font size to tweet length — long tweets need smaller text to fit
    const textFontSize = text.length > 180 ? 42 : text.length > 100 ? 54 : 68;

    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#000000",
            color: "#ffffff",
            padding: "72px 80px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              fontSize: 28,
            }}
          >
            <span style={{ fontWeight: 700 }}>KJ</span>
            <span style={{ marginLeft: 14, opacity: 0.55 }}>
              @KJFUTURES
            </span>
          </div>

          <div
            style={{
              display: "flex",
              flex: 1,
              alignItems: "center",
              fontSize: textFontSize,
              fontWeight: 500,
              lineHeight: 1.3,
              letterSpacing: "-0.02em",
              marginTop: 40,
              marginBottom: 40,
              whiteSpace: "pre-wrap",
            }}
          >
            {text}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 24,
              opacity: 0.55,
              borderTop: "1px solid rgba(255, 255, 255, 0.18)",
              paddingTop: 24,
            }}
          >
            <span>{dateStr}</span>
            <span>kjtweets.com</span>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        headers: {
          "cache-control":
            "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
        },
      }
    );
  } catch (error) {
    console.error("OG image generation failed:", error);
    return Response.redirect("https://kjtweets.com/og-card.png", 302);
  }
}
