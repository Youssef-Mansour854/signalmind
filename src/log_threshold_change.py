# src/log_threshold_change.py
import os
import sys
import datetime
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

def log_threshold_change(param_name: str, old_value, new_value, rationale: str):
    """
    Logs manual threshold modifications into MongoDB threshold_history collection
    for historical tracking and impact evaluation.
    """
    db_uri = os.environ.get("MONGODB_URI", "mongodb://localhost:27017/signalmind")
    try:
        client = MongoClient(db_uri, serverSelectionTimeoutMS=5000)
        client.admin.command('ping')
        db = client.get_default_database()
        if db is None or db.name == "admin":
            db = client["signalmind"]
    except Exception as e:
        print(f"[ERROR] Could not connect to MongoDB to log threshold change: {e}")
        return False

    history_col = db["threshold_history"]
    doc = {
        "paramName": param_name,
        "oldValue": old_value,
        "newValue": new_value,
        "rationale": rationale,
        "changedAt": datetime.datetime.now(datetime.timezone.utc)
    }

    res = history_col.insert_one(doc)
    print(f"[AUDIT LOGGED] Recorded threshold change for '{param_name}': {old_value} -> {new_value} (ID: {res.inserted_id})")
    return True

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python src/log_threshold_change.py <param_name> <old_val> <new_val> <rationale>")
        print("Example: python src/log_threshold_change.py RSI_SAFE_MIN 40 45 \"Increase RSI lower bound due to weekly review recommendation\"")
        sys.exit(1)

    p_name = sys.argv[1]
    o_val = sys.argv[2]
    n_val = sys.argv[3]
    rat = sys.argv[4] if len(sys.argv) > 4 else "Manual threshold update"

    log_threshold_change(p_name, o_val, n_val, rat)
