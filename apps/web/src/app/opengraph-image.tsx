import { ImageResponse } from "next/og";

export const dynamic = "force-static";
export const alt = "DawnlightCore Preview 开发者门户";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#17191a",
        color: "#f3f3ef",
        padding: "72px 80px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div
          style={{
            display: "flex",
            width: 52,
            height: 52,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
            background: "#c25b2a",
            fontSize: 27,
            fontWeight: 700,
          }}
        >
          D
        </div>
        <div style={{ color: "#a6adb0", fontSize: 24 }}>
          Preview developer portal
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ fontSize: 78, fontWeight: 750 }}>DawnlightCore</div>
        <div
          style={{
            maxWidth: 860,
            color: "#a6adb0",
            fontSize: 30,
            lineHeight: 1.4,
          }}
        >
          Survivalcraft 光影管线的版本化文档、合同快照与官方发布入口
        </div>
      </div>
      <div style={{ display: "flex", gap: 30, color: "#73d0d0", fontSize: 22 }}>
        <span>Manifest v3</span>
        <span>zh-CN</span>
        <span>Static preview</span>
      </div>
    </div>,
    size,
  );
}
