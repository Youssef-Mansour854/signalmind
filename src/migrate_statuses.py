import os
import pymongo
from dotenv import load_dotenv

load_dotenv()

def run_status_migration():
    db_uri = os.environ.get("MONGODB_URI")
    client = pymongo.MongoClient(db_uri)
    db = client.get_default_database() if client.get_default_database() is not None else client['signalmind']

    print("=== STARTING MONGO STATUS STANDARDIZATION MIGRATION ===")

    signals_col = db['signals']
    portfolio_col = db['user_portfolio']

    # Mapping for signals collection
    signal_mappings = [
        ('Active', 'ACTIVE'),
        ('active', 'ACTIVE'),
        ('Pending', 'PENDING'),
        ('pending', 'PENDING'),
        ('Expired', 'EXPIRED'),
        ('expired', 'EXPIRED'),
        ('Hit TP', 'HIT_TP'),
        ('hit tp', 'HIT_TP'),
        ('Hit SL', 'HIT_SL'),
        ('hit sl', 'HIT_SL'),
    ]

    for old_st, new_st in signal_mappings:
        res = signals_col.update_many({'status': old_st}, {'$set': {'status': new_st}})
        if res.modified_count > 0:
            print(f"[SIGNALS] Converted {res.modified_count} documents from '{old_st}' -> '{new_st}'")

    # Mapping for user_portfolio collection
    portfolio_mappings = [
        ('Active', 'ACTIVE'),
        ('active', 'ACTIVE'),
        ('Hit TP', 'HIT_TP'),
        ('Hit SL', 'HIT_SL'),
        ('Closed', 'CLOSED'),
        ('closed', 'CLOSED'),
    ]

    for old_st, new_st in portfolio_mappings:
        res = portfolio_col.update_many({'status': old_st}, {'$set': {'status': new_st}})
        if res.modified_count > 0:
            print(f"[PORTFOLIO] Converted {res.modified_count} documents from '{old_st}' -> '{new_st}'")

    # Invalidate legacy signals with RRR < 1.50 (e.g. legacy AAPL signal)
    active_signals = list(signals_col.find({'status': {'$in': ['ACTIVE', 'PENDING']}}))
    invalidated_count = 0
    for sig in active_signals:
        entry = float(sig.get('entryPrice') or 0)
        sl = float(sig.get('stopLoss') or 0)
        tp = float(sig.get('takeProfit') or 0)
        risk = entry - sl if entry and sl else 0
        reward = tp - entry if tp and entry else 0
        rrr = reward / risk if risk > 0 else 0

        if rrr < 1.50:
            signals_col.update_one(
                {'_id': sig['_id']},
                {'$set': {
                    'status': 'INVALIDATED',
                    'invalidationReason': f'Legacy RRR {rrr:.2f} < required 1.50 minimum'
                }}
            )
            print(f"[MIGRATION] Invalidated signal {sig.get('symbol')} (ID: {sig['_id']}) - RRR: {rrr:.2f} < 1.50")
            invalidated_count += 1

    print(f"\nMigration Complete! Invalidated {invalidated_count} low-RRR legacy signals.")
    print("=== NEW DISTINCT STATUSES IN SIGNALS ===")
    print(signals_col.distinct('status'))
    print("=== NEW DISTINCT STATUSES IN PORTFOLIO ===")
    print(portfolio_col.distinct('status'))

if __name__ == "__main__":
    run_status_migration()
