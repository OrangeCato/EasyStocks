import { useState } from "react";

export default function QuoteSearch() {
  const [symbol, setSymbol] = useState("");
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");

  const API = import.meta.env.VITE_API_URL;

  async function handleSearch(e) {
    e.preventDefault();
    setErr("");
    setResult(null);

    if (!symbol) return;

    try {
      const res = await fetch(`${API}/api/quotes?symbols=${symbol}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || "Request failed");

      setResult(json.data?.[0] ?? null);
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div className="es-card">
      <div style={{ fontWeight: 900, marginBottom: 10 }}>
        Quote Lookup
      </div>

      <form onSubmit={handleSearch} className="es-form-row">
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="BTC"
          className="es-input"
        />

        <button type="submit" className="es-btn">
          Search
        </button>
      </form>

      {err && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            borderRadius: 12,
            border: "1px solid rgba(239,68,68,0.35)",
            background: "rgba(239,68,68,0.10)",
            color: "var(--red)",
          }}
        >
          {err}
        </div>
      )}

      {result && (
        <div
          style={{
            marginTop: 16,
            padding: 14,
            borderRadius: 14,
            border: "1px solid var(--border)",
            background: "rgba(255,255,255,0.03)",
            display: "grid",
            gap: 6,
          }}
        >
          <div style={{ fontWeight: 900, fontSize: 16 }}>
            {result.name} ({result.symbol})
          </div>

          <div>
            Price:{" "}
            <span style={{ fontWeight: 800 }}>
              {new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: result.currency || "USD",
              }).format(result.price)}
            </span>
          </div>

          <div>
            24h:{" "}
            <span
              className={`es-pill ${
                result.percent_change_24h >= 0 ? "green" : "red"
              }`}
            >
              {result.percent_change_24h?.toFixed(2)}%
            </span>
          </div>

          <div>
            Market Cap:{" "}
            {new Intl.NumberFormat(undefined, {
              style: "currency",
              currency: result.currency || "USD",
              maximumFractionDigits: 0,
            }).format(result.market_cap)}
          </div>
        </div>
      )}
    </div>
  );
}