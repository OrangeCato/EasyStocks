import { useEffect, useState } from "react";

const KEY = "demo_notice_dismissed_v1";

export default function TopNotice() {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const dismissed = localStorage.getItem(KEY) === "1";
    setHidden(dismissed);
  }, []);

  if (hidden) return null;

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 9999,
        width: "100%",
        background: "rgba(0,0,0,0.85)",
        color: "rgba(255,255,255,0.92)",
        borderBottom: "1px solid rgba(255,255,255,0.12)",
        backdropFilter: "blur(10px)",
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "10px 14px",
          display: "flex",
          gap: 12,
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 12,
          lineHeight: 1.3,
        }}
      >
        <div>
          <b>Note:</b> This demo runs on free-tier cloud infrastructure. If inactive,
          the server may take ~20–40 seconds to wake.
        </div>

        <button
          onClick={() => {
            localStorage.setItem(KEY, "1");
            setHidden(true);
          }}
          style={{
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.92)",
            borderRadius: 999,
            padding: "6px 10px",
            cursor: "pointer",
            fontSize: 12,
            whiteSpace: "nowrap",
          }}
          title="Hide"
        >
          Got it
        </button>
      </div>
    </div>
  );
}