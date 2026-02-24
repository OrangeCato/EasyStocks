import json
import os
import uuid
from datetime import datetime, timezone

ALERTS_FILE = os.path.join(os.path.dirname(__file__), "alerts.json")

def _now_iso():
    return datetime.now(timezone.utc).isoformat()

def load_alerts():
    if not os.path.exists(ALERTS_FILE):
        return []
    with open(ALERTS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_alerts(alerts):
    with open(ALERTS_FILE, "w", encoding="utf-8") as f:
        json.dump(alerts, f, indent=2)

def add_alert(rule):
    alerts = load_alerts()
    rule = dict(rule)
    rule["id"] = rule.get("id") or str(uuid.uuid4())
    rule["created_at"] = rule.get("created_at") or _now_iso()
    alerts.append(rule)
    save_alerts(alerts)
    return rule

def delete_alert(alert_id: str) -> bool:
    alerts = load_alerts()
    new_alerts = [a for a in alerts if a.get("id") != alert_id]
    save_alerts(new_alerts)
    return len(new_alerts) != len(alerts)