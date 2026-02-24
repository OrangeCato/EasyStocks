import { useEffect, useMemo, useState } from "react";

const DEFAULT = {
  symbol: "BTC",
  type: "pct24", // pct24 | price
  op: ">",
  value: 5,
};

function typeLabel(t) {
  return t === "pct24" ? "24h %" : "Price";
}

function opLabel(op) {
  return op === ">" ? "Above" : "Below";
}

function pillClassForRule(r) {
  // color hint: up = green, down = red
  return r.op === ">" ? "green" : "red";
}

function formatThreshold(r) {
  const v = Number(r.value);
  if (!Number.isFinite(v)) return String(r.value ?? "—");
  if (r.type === "pct24") return `${v.toFixed(2)}%`;
  // price
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(v);
}

export default function AlertManager() {
  const API = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

  const [rules, setRules] = useState([]);
  const [triggered, setTriggered] = useState([]);
  const [form, setForm] = useState(DEFAULT);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const formValid = useMemo(() => {
    const sym = (form.symbol || "").trim();
    return sym.length > 0 && Number.isFinite(Number(form.value));
  }, [form]);

  async function loadRules() {
    const res = await fetch(`${API}/api/alerts`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.detail || "Failed to load alerts");
    setRules(json);
  }

  async function loadTriggered() {
    const res = await fetch(`${API}/api/alerts/check`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.detail || "Failed to check alerts");
    setTriggered(json.triggered || []);
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setErr("");
        await loadRules();
        await loadTriggered();
      } catch (e) {
        if (!alive) return;
        setErr(e.message);
      }
    })();

    const t = setInterval(() => {
      loadTriggered().catch(() => {});
    }, 60_000);

    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [API]);

  async function onCreate(e) {
    e.preventDefault();
    if (!formValid) return;

    setBusy(true);
    setErr("");
    try {
      const payload = {
        symbol: form.symbol.trim().toUpperCase(),
        type: form.type,
        op: form.op,
        value: Number(form.value),
      };

      const res = await fetch(`${API}/api/alerts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || "Failed to create alert");

      setRules((prev) => [json, ...prev]);
      setForm(DEFAULT);
      await loadTriggered();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id) {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`${API}/api/alerts/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail || "Failed to delete alert");
      setRules((prev) => prev.filter((r) => r.id !== id));
      await loadTriggered();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="es-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div style={{ fontWeight: 900 }}>Alerts</div>
        <div className="es-muted">Set Price Alerts & Monitor Volatility</div>
      </div>

      {err && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            borderRadius: 12,
            border: "1px solid rgba(239,68,68,0.35)",
            background: "rgba(239,68,68,0.10)",
          }}
        >
          <b style={{ color: "var(--red)" }}>Error:</b> {err}
        </div>
      )}

      {/* --- Create alert form --- */}
      <form onSubmit={onCreate} style={{ display: "grid", gap: 10, marginTop: 14 }}>
        <div className="es-form-row">
          <input
            value={form.symbol}
            onChange={(e) => setForm((p) => ({ ...p, symbol: e.target.value }))}
            placeholder="BTC"
            className="es-input"
            aria-label="Symbol"
          />

          <select
            value={form.type}
            onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
            className="es-select"
            aria-label="Trigger type"
          >
            <option value="pct24">24h % change</option>
            <option value="price">Price (USD)</option>
          </select>

          <select
            value={form.op}
            onChange={(e) => setForm((p) => ({ ...p, op: e.target.value }))}
            className="es-select"
            aria-label="Direction"
          >
            <option value=">">Above</option>
            <option value="<">Below</option>
          </select>

          <input
            type="number"
            step="0.01"
            value={form.value}
            onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))}
            className="es-input"
            aria-label="Threshold"
            placeholder={form.type === "pct24" ? "5 (%)" : "2500 (USD)"}
          />
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="es-btn" disabled={!formValid || busy} type="submit">
            Add alert
          </button>

          <button
            className="es-btn"
            type="button"
            onClick={() => loadTriggered().catch(() => {})}
            disabled={busy}
            style={{ opacity: 0.9 }}
          >
            Check now
          </button>

          <div className="es-muted" style={{ marginLeft: "auto" }}>
            Example: <b>ETH</b> Price <b>Below</b> <b>$2500</b>
          </div>
        </div>
      </form>

      {/* --- Rules + Triggered --- */}
      <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
        {/* Rules */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <div style={{ fontWeight: 850 }}>Rules</div>
            <div className="es-muted">{rules.length ? `${rules.length} saved` : "none yet"}</div>
          </div>

          {rules.length === 0 ? (
            <div className="es-muted">No alerts yet — add one above.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {rules.map((r) => (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    padding: 12,
                    borderRadius: 14,
                    border: "1px solid var(--border)",
                    background: "rgba(255,255,255,0.03)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 900 }}>{r.symbol}</span>

                    <span className={`es-pill ${r.type === "price" ? "blue" : "amber"}`}>
                      {typeLabel(r.type)}
                    </span>

                    <span className={`es-pill ${pillClassForRule(r)}`}>
                      {opLabel(r.op)}
                    </span>

                    <span style={{ fontWeight: 800 }}>{formatThreshold(r)}</span>
                  </div>

                  <button className="es-btn es-btn-danger" onClick={() => onDelete(r.id)} disabled={busy}>
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Triggered */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <div style={{ fontWeight: 850 }}>Triggered</div>
            <div className="es-muted">{triggered.length ? `${triggered.length} active` : "quiet"}</div>
          </div>

          {triggered.length === 0 ? (
            <div className="es-muted">No alerts triggered right now.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {triggered.map((t, idx) => {
                const up = t?.op === ">";
                const tone = up ? "green" : "red";
                return (
                  <div
                    key={`${t.id || idx}-${t.time}`}
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      border: "1px solid var(--border)",
                      background: "rgba(255,255,255,0.03)",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span className={`es-pill ${tone}`}>{t.time}</span>
                      <span style={{ fontWeight: 900 }}>{t.symbol}</span>
                      <span className={`es-pill ${t.type === "price" ? "blue" : "amber"}`}>
                        {typeLabel(t.type)}
                      </span>
                      <span className="es-muted">{t.message}</span>
                    </div>
                    <span className={`es-pill ${tone}`}>{up ? "Up" : "Down"}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}