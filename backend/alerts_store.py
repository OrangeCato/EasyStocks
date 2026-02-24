# alerts_store.py
import json
import os
import uuid
from typing import List, Dict, Any

# Stores alerts locally in backend/alerts.json
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ALERTS_PATH = os.path.join(BASE_DIR, "alerts.json")


def _read_file() -> List[Dict[str, Any]]:
    if not os.path.exists(ALERTS_PATH):
        return []
    try:
        with open(ALERTS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
        return []
    except json.JSONDecodeError:
        # corrupted file -> reset safely
        return []
    except Exception:
        return []


def _write_file(alerts: List[Dict[str, Any]]) -> None:
    # atomic-ish write
    tmp = ALERTS_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(alerts, f, indent=2, ensure_ascii=False)
    os.replace(tmp, ALERTS_PATH)


def list_alerts() -> List[Dict[str, Any]]:
    return _read_file()


def add_alert(alert: Dict[str, Any]) -> Dict[str, Any]:
    """
    alert expected keys:
      symbol (str), type ("pct24"|"price"), op (">"|"<"), value (float)
    """
    alerts = _read_file()

    new_alert = {
        "id": uuid.uuid4().hex[:10],
        "symbol": str(alert.get("symbol", "")).upper().strip(),
        "type": alert.get("type"),
        "op": alert.get("op"),
        "value": float(alert.get("value")),
    }

    alerts.append(new_alert)
    _write_file(alerts)
    return new_alert


def delete_alert(alert_id: str) -> bool:
    alerts = _read_file()
    before = len(alerts)
    alerts = [a for a in alerts if a.get("id") != alert_id]
    if len(alerts) == before:
        return False
    _write_file(alerts)
    return True