import { useEffect, useState } from "react";
import { apiGet } from "../lib/api";
import dayjs from "dayjs";

function fmtMoneyUSD(n) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtPct(n) {
  if (n === null || n === undefined) return "—";
  return `${Number(n).toFixed(2)}%`;
}

function fmtTimestamp(ts) {
  if (!ts) return "—";

  const d = dayjs(ts);
  if (!d.isValid()) return ts;

  return d.format("MMM D, YYYY · HH:mm [UTC]");
}

export default function GlobalMetrics() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let mounted = true;

    apiGet("/api/global")
      .then((d) => mounted && setData(d))
      .catch((e) => mounted && setErr(e.message || String(e)));

    return () => {
      mounted = false;
    };
  }, []);

  if (err) {
    return (
      <div className="es-card">
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Global Crypto Metrics</div>
        <div style={{ color: "#b00020" }}>Error: {err}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="es-card">
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Global Crypto Metrics</div>
        <div style={{ opacity: 0.7 }}>Loading…</div>
      </div>
    );
  }

  return (
    <div className="es-card">
      <div style={{ fontWeight: 800, marginBottom: 10 }}>Global Crypto Metrics</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
        <div>
          <div style={{ opacity: 0.7, fontSize: 12 }}>Total Market Cap</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{fmtMoneyUSD(data.total_market_cap)}</div>
        </div>

        <div>
          <div style={{ opacity: 0.7, fontSize: 12 }}>24h Volume</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{fmtMoneyUSD(data.total_volume_24h)}</div>
        </div>

        <div>
          <div style={{ opacity: 0.7, fontSize: 12 }}>BTC Dominance</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{fmtPct(data.btc_dominance)}</div>
        </div>

        <div>
          <div style={{ opacity: 0.7, fontSize: 12 }}>ETH Dominance</div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{fmtPct(data.eth_dominance)}</div>
        </div>
      </div>

      <div style={{ marginTop: 12 }} className="es-muted">
        Updated {fmtTimestamp(data.last_updated)}
      </div>
    </div>
  );
}