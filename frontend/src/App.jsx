import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import "./app.css";

import GlobalMetrics from "./components/GlobalMetrics";
import QuoteSearch from "./components/QuoteSearch";
import AlertManager from "./components/AlertManager";
import { buildRankingsFromListings } from "./lib/signals";
import TopNotice from "./components/TopNotice";

// ---------------- UI helpers ----------------

function Card({ title, right, children }) {
  return (
    <div className="es-card">
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 10,
        }}
      >
        <div style={{ fontWeight: 900 }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

function formatCell(key, value) {
  if (value == null) return "—";

  if (key === "change_24h") {
    const n = typeof value === "string" ? parseFloat(value) : value;
    if (Number.isNaN(n)) return value;
    const cls = n >= 0 ? "green" : "red";
    const txt = `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
    return <span className={`es-pill ${cls}`}>{txt}</span>;
  }

  if (key === "volatility") {
    const v = String(value).toLowerCase();
    const cls = v.includes("high") ? "amber" : "blue";
    return <span className={`es-pill ${cls}`}>{value}</span>;
  }

  if (key === "type") {
    const t = String(value);
    const cls = t === "price" ? "blue" : t === "pct24" ? "amber" : "blue";
    return <span className={`es-pill ${cls}`}>{t}</span>;
  }

  if (key === "score") {
    const n = typeof value === "string" ? parseFloat(value) : value;
    if (Number.isNaN(n)) return value;
    return <span style={{ fontWeight: 900 }}>{Math.round(n)}</span>;
  }

  return value;
}

function Table({ columns, rows, rowClassName }) {
  return (
    <div className="es-table-wrap">
      <table className="es-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx} className={rowClassName ? rowClassName(r, idx) : ""}>
              {columns.map((c) => (
                <td key={c.key}>{formatCell(c.key, r[c.key])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------- Toast helpers ----------------

function toastToneClass(alert) {
  // You can tweak mapping later:
  // op ">" -> green, "<" -> red
  if (alert?.op === ">") return "green";
  if (alert?.op === "<") return "red";
  return "blue";
}

function prettyReason(alert) {
  const sym = alert?.symbol ?? "—";
  const type = alert?.type === "price" ? "Price" : "24h %";
  const dir = alert?.op === ">" ? "above" : alert?.op === "<" ? "below" : "";
  const thr = alert?.value;
  const cur = alert?.current;

  if (alert?.type === "price") {
    const t = Number.isFinite(Number(thr)) ? Number(thr).toFixed(2) : thr;
    const c = Number.isFinite(Number(cur)) ? Number(cur).toFixed(2) : cur;
    return `${sym} • ${type} ${dir} ${t} (now ${c})`;
  }
  const t = Number.isFinite(Number(thr)) ? Number(thr).toFixed(2) : thr;
  const c = Number.isFinite(Number(cur)) ? Number(cur).toFixed(2) : cur;
  return `${sym} • ${type} ${dir} ${t}% (now ${c}%)`;
}

// ---------------- Sound helpers ----------------

function makeBeepPlayer() {
  let ctx = null;

  function ensureCtx() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!ctx) ctx = new AudioCtx();
    if (ctx.state === "suspended") ctx.resume().catch(() => { });
    return ctx;
  }

  function tone({ freq = 880, durationMs = 140, type = "sine", gain = 0.10 }) {
    const c = ensureCtx();
    const o = c.createOscillator();
    const g = c.createGain();

    o.type = type;
    o.frequency.value = freq;

    const now = c.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);

    o.connect(g);
    g.connect(c.destination);

    o.start(now);
    o.stop(now + durationMs / 1000);
  }

  function playAlertSound(alert) {
    const isUp = alert?.op === ">";
    const isDown = alert?.op === "<";
    const isPrice = alert?.type === "price";
    const isPct = alert?.type === "pct24";

    if (isPrice && isUp) {
      tone({ freq: 740, durationMs: 110, type: "triangle", gain: 0.12 });
      setTimeout(() => tone({ freq: 920, durationMs: 130, type: "triangle", gain: 0.12 }), 120);
      return;
    }

    if (isPrice && isDown) {
      tone({ freq: 680, durationMs: 110, type: "triangle", gain: 0.12 });
      setTimeout(() => tone({ freq: 520, durationMs: 130, type: "triangle", gain: 0.12 }), 120);
      return;
    }

    if (isPct && isUp) {
      tone({ freq: 980, durationMs: 150, type: "sine", gain: 0.10 });
      setTimeout(() => tone({ freq: 1220, durationMs: 120, type: "sine", gain: 0.09 }), 120);
      return;
    }

    if (isPct && isDown) {
      tone({ freq: 820, durationMs: 150, type: "sine", gain: 0.10 });
      setTimeout(() => tone({ freq: 640, durationMs: 120, type: "sine", gain: 0.09 }), 120);
      return;
    }

    tone({ freq: 880, durationMs: 160, type: "sine", gain: 0.10 });
  }

  return { ensureCtx, playAlertSound };
}

// ---------------- App ----------------

export default function App() {
  const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

  const [listings, setListings] = useState([]);
  const [listingsErr, setListingsErr] = useState("");

  const [alerts, setAlerts] = useState([]);
  const [alertsErr, setAlertsErr] = useState("");

  // ✅ default ON (still needs one user click to unlock audio in most browsers)
  const [soundOn, setSoundOn] = useState(true);
  const [needsAudioClick, setNeedsAudioClick] = useState(true);

  // Toasts + row highlight
  const [toasts, setToasts] = useState([]);
  const [flashIds, setFlashIds] = useState(() => new Set());

  // cooldown so it doesn’t spam
  const lastPlayedAtRef = useRef(new Map()); // id -> timestamp ms
  const COOLDOWN_MS = 2 * 60 * 1000;

  const audioRef = useRef(null);
  if (!audioRef.current) audioRef.current = makeBeepPlayer();

  // ---- Load listings ----
  useEffect(() => {
    let cancelled = false;

    async function loadListings() {
      try {
        setListingsErr("");
        const res = await fetch(`${API}/api/listings?limit=200`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.detail || "Failed to load listings");
        if (!cancelled) setListings(json.data || []);
      } catch (e) {
        if (!cancelled) setListingsErr(e.message);
      }
    }

    loadListings();
    const t = setInterval(loadListings, 120000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [API]);

  function pushToast(alert) {
    const id = `t-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const cls = toastToneClass(alert);

    const toast = {
      id,
      cls,
      title: "Alert triggered",
      text: prettyReason(alert),
      time: dayjs().format("HH:mm:ss"),
    };

    setToasts((prev) => [toast, ...prev].slice(0, 5));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 6000);
  }

  function flashRow(alertId) {
    setFlashIds((prev) => {
      const next = new Set(prev);
      next.add(alertId);
      return next;
    });

    setTimeout(() => {
      setFlashIds((prev) => {
        const next = new Set(prev);
        next.delete(alertId);
        return next;
      });
    }, 2500);
  }

  // ---- Load triggered alerts + sound/toast/flash for newly triggered ----
  useEffect(() => {
    let cancelled = false;

    async function loadTriggered() {
      try {
        setAlertsErr("");
        const res = await fetch(`${API}/api/alerts/check`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.detail || "Failed to check alerts");

        const triggered = json.triggered || [];
        const now = Date.now();

        const newlyTriggered = [];

        for (const a of triggered) {
          const id = a.id || `${a.symbol}-${a.type}-${a.op}-${a.value}`;
          const last = lastPlayedAtRef.current.get(id) || 0;

          if (now - last > COOLDOWN_MS) {
            newlyTriggered.push({ ...a, _stableId: id });
            lastPlayedAtRef.current.set(id, now);
          }
        }

        if (newlyTriggered.length > 0) {
          // Visual explanation
          newlyTriggered.forEach((a) => {
            pushToast(a);
            flashRow(a._stableId);
          });

          // Audio
          if (soundOn) {
            try {
              audioRef.current.ensureCtx(); // might throw if blocked
              setNeedsAudioClick(false);
              newlyTriggered.forEach((a, i) => {
                setTimeout(() => audioRef.current.playAlertSound(a), i * 220);
              });
            } catch {
              setNeedsAudioClick(true);
            }
          }
        }

        // Attach stable ids so we can flash the row even if backend id missing
        const withStableIds = triggered.map((a) => ({
          ...a,
          _stableId: a.id || `${a.symbol}-${a.type}-${a.op}-${a.value}`,
        }));

        if (!cancelled) setAlerts(withStableIds);
      } catch (e) {
        if (!cancelled) setAlertsErr(e.message);
        if (!cancelled) setAlerts([]);
      }
    }

    loadTriggered();
    const t = setInterval(loadTriggered, 60000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [API, soundOn]);

  const rankings = useMemo(() => buildRankingsFromListings(listings), [listings]);
  const updated = dayjs().format("MMM D, YYYY HH:mm");
  const topRankings = useMemo(() => rankings.slice(0, 20), [rankings]);

  const soundButton = (
    <button
      className="es-btn"
      onClick={() => {
        // click unlocks audio on most browsers
        try {
          audioRef.current.ensureCtx();
          setNeedsAudioClick(false);
        } catch {
          setNeedsAudioClick(true);
        }
        setSoundOn((v) => !v);
      }}
      title="Enable/disable alert sounds"
    >
      {soundOn ? "Sounds: On 🔊" : "Sounds: Off 🔇"}
    </button>
  );

  return (
    <div className="es-app">
      {/* Toasts */}
      <div className="es-toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`es-toast ${t.cls}`}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontWeight: 900 }}>{t.title}</div>
              <div className="es-muted">{t.time}</div>
            </div>
            <div style={{ marginTop: 6, opacity: 0.95 }}>{t.text}</div>
          </div>
        ))}
      </div>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: 20 }}>
        <>
          <TopNotice />
        </>
        <header
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 18,
          }}
        >
          <div>
            <div style={{ fontSize: 26, fontWeight: 900 }}>EasyStonks</div>
            <div style={{ opacity: 0.75 }}>
              Market signals dashboard · Updated: <b>{updated}</b>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {soundButton}
            <a
              className="es-btn"
              href="https://github.com/OrangeCato/EasyStonks"
              target="_blank"
              rel="noreferrer"
            >
              View GitHub →
            </a>
          </div>
        </header>

        {/* Audio unlock hint */}
        {soundOn && needsAudioClick && (
          <div className="es-card" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Enable alert audio</div>
            <div className="es-muted">
              Browsers block audio until you click once. Click <b>“Sounds: On 🔊”</b> to enable.
            </div>
          </div>
        )}

        <GlobalMetrics />
        <div style={{ height: 12 }} />
        <QuoteSearch />

        <div style={{ height: 12 }} />
        <AlertManager />

        {listingsErr && (
          <div
            style={{
              background: "rgba(239,68,68,0.10)",
              border: "1px solid rgba(239,68,68,0.25)",
              padding: 12,
              borderRadius: 12,
              marginTop: 16,
              color: "var(--text)",
            }}
          >
            <b>Listings error:</b> {listingsErr}
          </div>
        )}

        {alertsErr && (
          <div
            style={{
              background: "rgba(245,158,11,0.10)",
              border: "1px solid rgba(245,158,11,0.25)",
              padding: 12,
              borderRadius: 12,
              marginTop: 12,
              color: "var(--text)",
            }}
          >
            <b>Alerts check error:</b> {alertsErr}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16, marginTop: 16 }}>
          <Card title="Top Rankings" right={<span className="es-muted">Top 20</span>}>
            {listings.length === 0 && !listingsErr ? (
              <div style={{ opacity: 0.75 }}>Loading…</div>
            ) : (
              <Table
                columns={[
                  { key: "symbol", label: "Symbol" },
                  { key: "score", label: "Score" },
                  { key: "volatility", label: "Volatility" },
                  { key: "change_24h", label: "24h" },
                  { key: "reason", label: "Reason" },
                ]}
                rows={topRankings}
              />
            )}
          </Card>

          <Card
            title="Triggered Alerts (live)"
            right={
              alerts.length ? (
                <span className="es-pill red">{alerts.length} active</span>
              ) : (
                <span className="es-muted">none</span>
              )
            }
          >
            {alerts.length === 0 ? (
              <div style={{ opacity: 0.75 }}>No alerts triggered right now.</div>
            ) : (
              <Table
                columns={[
                  { key: "time", label: "Time" },
                  { key: "symbol", label: "Symbol" },
                  { key: "type", label: "Type" },
                  { key: "message", label: "Message" },
                ]}
                rows={alerts}
                rowClassName={(row) => (flashIds.has(row._stableId) ? "es-row-flash" : "")}
              />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
