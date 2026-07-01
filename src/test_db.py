# src/test_db.py
import os
import sys
from dotenv import load_dotenv
from pymongo import MongoClient

# 1. Load env variables from .env file
load_dotenv()

def test_connection():
    print("==========================================")
    print("   SignalMind MongoDB Connection Tester   ")
    print("==========================================")
    
    # 2. Extract MongoDB URI
    db_uri = os.environ.get("MONGODB_URI")
    if not db_uri:
        print("[FAIL] Error: MONGODB_URI environment variable is missing from your .env file.")
        print("Please define MONGODB_URI in your root-level .env file (e.g. MONGODB_URI=\"mongodb://localhost:27017/signalmind\").")
        sys.exit(1)

    print("Reading MONGODB_URI configuration...")
    # Hide password if Atlas URI
    masked_uri = db_uri
    if "@" in db_uri and "://" in db_uri:
        try:
            parts = db_uri.split("@")
            protocol_part = parts[0].split("://")
            auth_info = protocol_part[1].split(":")
            username = auth_info[0]
            masked_uri = f"{protocol_part[0]}://{username}:******@{parts[1]}"
        except Exception:
            masked_uri = "mongodb+srv://******@cluster..."
            
    print(f"Attempting connection to: {masked_uri}")

    # 3. Create MongoClient with a short timeout (3 seconds)
    try:
        client = MongoClient(db_uri, serverSelectionTimeoutMS=3000)
        
        # 4. Trigger server check by pinging
        client.admin.command('ping')
        
        # 5. Extract database metadata (PyMongo 4+ does not support bool(db) truth testing)
        try:
            db = client.get_default_database()
        except Exception:
            db = None
            
        if db is None:
            db = client["signalmind"]
            
        print("\n[SUCCESS] Successfully connected to MongoDB!")
        print(f"Connected Database: {db.name}")
        print("Connection parameters are configured correctly.")
        print("==========================================\n")
        
    except Exception as e:
        print("\n[FAIL] Connection Failed!")
        print("------------------------------------------")
        print(f"Error Details: {e}")
        print("------------------------------------------")
        print("\nTroubleshooting Steps:")
        if "localhost" in db_uri or "127.0.0.1" in db_uri:
            print("1. Verify that your local MongoDB server is running. You can start it via command line or MongoDB Compass.")
            print("   - Windows Command: net start MongoDB (from Administrator Command Prompt)")
        else:
            print("1. If using MongoDB Atlas, check if your current IP Address is whitelisted in Atlas (Network Access).")
            print("2. Verify that your username, password, and cluster host address in the MONGODB_URI connection string are correct.")
        print("==========================================\n")
        sys.exit(1)

if __name__ == "__main__":
    test_connection()
