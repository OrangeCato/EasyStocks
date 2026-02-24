import os
import time
import requests
from typing import Dict, List, Optional, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

from alerts_store import list_alerts, add_alert, delete_alert

load_dotenv()

app = FastAPI(title="EasyStonks API")

# ---------------- CORS (PRODUCTION READY) ----------------
# Set this in Render:
# ALLOWED_ORIGINS="https://alessandrazamora.github.io,http://localhost:5173"
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "").strip()

if ALLOWED_ORIGINS:
    origins = [o.strip().rstrip("/") for o in ALLOWED_ORIGINS.split(",") if o.strip()]
else:
    # Safe dev defaults
    origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- CoinMarketCap ----------------
BASE_URL = "https://pro-api.coinmarketcap.com"
API_KEY = os.getenv("COINMARKETCAP_API_KEY")
CURRENCY = os.getenv("CMC_CURRENCY", "USD")


def cmc_headers():
    if not API_KEY:
        raise HTTPException(status_code=500, detail="Missing COINMARKETCAP_API_KEY in environment")
    return {"X-CMC_PRO_API_KEY": API_KEY}


# ---------------- Health / Debug ----------------
@app.get("/api/health")
def health():
    return {"ok": True}

@app.get("/api/info")
def info():
    # Helpful for verifying Render env + CORS config (no secrets exposed)
    return {
        "ok": True,
        "currency_default": CURRENCY,
        "cors_origins": origins,
        "has_cmc_key": bool(API_KEY),
    }


# ---------------- Metrics ----------------
@app.get("/api/global")
def global_metrics(convert: str = None):
    currency = convert or CURRENCY
    url = f"{BASE_URL}/v1/global-metrics/quotes/latest?convert={currency}"

    r = requests.get(url, headers=cmc_headers(), timeout=20)
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=r.text)

    results = r.json()
    data = results.get("data", {})
    quote = data.get("quote", {}).get(currency, {})

    return {
        "currency": currency,
        "btc_dominance": data.get("btc_dominance"),
        "eth_dominance": data.get("eth_dominance"),
        "total_market_cap": quote.get("total_market_cap"),
        "total_volume_24h": quote.get("total_volume_24h"),
        "last_updated": quote.get("last_updated") or data.get("last_updated"),
    }


@app.get("/api/listings")
def listings_latest(limit: int = 300, convert: str = None):
    currency = convert or CURRENCY
    url = f"{BASE_URL}/v1/cryptocurrency/listings/latest?convert={currency}&limit={limit}"

    r = requests.get(url, headers=cmc_headers(), timeout=20)
    if r.status_code != 200:
        raise HTTPException(status_code=r.status_code, detail=r.text)

    return r.json()


def _fetch_quotes(symbols: List[str], currency: str) -> Dict[str, dict]:
    sym_str = ",".join(sorted({s.upper().strip() for s in symbols if s and s.strip()}))
    if not sym_str:
        return {}

    url = f"{BASE_URL}/v1/cryptocurrency/quotes/latest?convert={currency}&symbol={sym_str}"

    try:
        r = requests.get(url, headers=cmc_headers(), timeout=20)
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"CMC request failed: {e}")

    if r.status_code != 200:
        try:
            payload = r.json()
            msg = payload.get("status", {}).get("error_message") or payload.get("message") or r.text
        except Exception:
            msg = r.text
        raise HTTPException(status_code=r.status_code, detail=msg)

    try:
        payload = r.json()
    except Exception:
        raise HTTPException(status_code=502, detail="CMC returned non-JSON response")

    data = payload.get("data")

    if not isinstance(data, dict):
        raise HTTPException(
            status_code=502,
            detail=f"Unexpected CMC response shape. data_type={type(data).__name__}",
        )

    return {k.upper(): v for k, v in data.items()}


@app.get("/api/quote")
def quote_latest(symbol: str, convert: str = None):
    currency = convert or CURRENCY
    symbol = (symbol or "").upper().strip()
    if not symbol:
        raise HTTPException(status_code=400, detail="symbol is required")

    data = _fetch_quotes([symbol], currency)
    if symbol not in data:
        raise HTTPException(status_code=404, detail=f"No quote for {symbol}")

    q = data[symbol]
    quote = q.get("quote", {}).get(currency, {})

    return {
        "symbol": symbol,
        "name": q.get("name"),
        "currency": currency,
        "price": quote.get("price"),
        "percent_change_24h": quote.get("percent_change_24h"),
        "market_cap": quote.get("market_cap"),
        "last_updated": quote.get("last_updated"),
    }


@app.get("/api/quotes")
def quotes_latest(symbols: str, convert: str = None):
    """
    symbols: comma-separated list e.g. BTC,ETH,SOL
    """
    currency = convert or CURRENCY
    syms = [s.strip().upper() for s in (symbols or "").split(",") if s.strip()]
    if not syms:
        raise HTTPException(status_code=400, detail="symbols is required (comma-separated)")

    data = _fetch_quotes(syms, currency)

    out = []
    for s in syms:
        q = data.get(s)
        if not q:
            continue
        quote = q.get("quote", {}).get(currency, {})
        out.append(
            {
                "symbol": s,
                "name": q.get("name"),
                "currency": currency,
                "price": quote.get("price"),
                "percent_change_24h": quote.get("percent_change_24h"),
                "market_cap": quote.get("market_cap"),
                "last_updated": quote.get("last_updated"),
            }
        )

    return {"currency": currency, "data": out}


# ---------------- ALERTS ----------------
AlertType = Literal["pct24", "price"]
AlertOp = Literal[">", "<"]


class AlertCreate(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=15)
    type: AlertType
    op: AlertOp
    value: float


class AlertOut(AlertCreate):
    id: str


def _normalize_alert(a: dict) -> Optional[dict]:
    """
    Convert older saved alert formats into the current schema:
    {symbol, type: 'pct24'|'price', op: '>'|'<', value: float, id}
    """
    if not a:
        return None

    symbol = (a.get("symbol") or "").upper().strip()
    if not symbol:
        return None

    a_type = a.get("type")
    op = a.get("op")
    value = a.get("value")

    if isinstance(a_type, str) and "_" in a_type and (op is None):
        base, direction = a_type.rsplit("_", 1)
        if base in ("pct24", "price") and direction in ("above", "below"):
            a_type = base
            op = ">" if direction == "above" else "<"

    if a_type not in ("pct24", "price"):
        return None
    if op not in (">", "<"):
        return None

    try:
        value = float(value)
    except Exception:
        return None

    return {
        "id": a.get("id"),
        "symbol": symbol,
        "type": a_type,
        "op": op,
        "value": value,
    }


def _evaluate_alert(alert: dict, quote: dict) -> Optional[dict]:
    symbol = (alert.get("symbol") or "").upper().strip()
    a_type = alert.get("type")
    op = alert.get("op")
    threshold = alert.get("value")

    try:
        threshold = float(threshold)
    except Exception:
        return None

    price = quote.get("price")
    pct24 = quote.get("percent_change_24h")

    if a_type == "price":
        current = price
        label = "price"
        unit = ""
    elif a_type == "pct24":
        current = pct24
        label = "24h %"
        unit = "%"
    else:
        return None

    if current is None:
        return None

    try:
        current = float(current)
    except Exception:
        return None

    hit = (current > threshold) if op == ">" else (current < threshold)
    if not hit:
        return None

    msg = f"{symbol} {label} is {current:.2f}{unit} {op} {threshold:.2f}{unit}"
    return {
        "time": time.strftime("%H:%M"),
        "symbol": symbol,
        "type": a_type,
        "message": msg,
        "current": current,
        "op": op,
        "value": threshold,
        "id": alert.get("id"),
    }


@app.get("/api/alerts", response_model=List[AlertOut])
def get_alerts():
    return list_alerts()


@app.post("/api/alerts", response_model=AlertOut)
def create_alert(payload: AlertCreate):
    alert = payload.model_dump()
    alert["symbol"] = alert["symbol"].upper().strip()
    return add_alert(alert)


@app.delete("/api/alerts/{alert_id}")
def remove_alert(alert_id: str):
    ok = delete_alert(alert_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"ok": True}


@app.get("/api/alerts/check")
def check_alerts(convert: str = None):
    currency = convert or CURRENCY
    alerts = list_alerts()
    if not alerts:
        return {"triggered": [], "checked": 0}

    symbols = sorted({a["symbol"].upper().strip() for a in alerts if a.get("symbol")})
    quotes_map = _fetch_quotes(symbols, currency)

    simplified = {}
    for sym, q in quotes_map.items():
        quote = q.get("quote", {}).get(currency, {})
        simplified[sym] = {
            "price": quote.get("price"),
            "percent_change_24h": quote.get("percent_change_24h"),
        }

    triggered = []
    for a in alerts:
        na = _normalize_alert(a)
        if not na:
            continue

        sym = na["symbol"]
        q = simplified.get(sym)
        if not q:
            continue

        t = _evaluate_alert(na, q)
        if t:
            triggered.append(t)

    return {"triggered": triggered, "checked": len(alerts), "currency": currency}