import os
import sqlite3
from datetime import datetime
import cloudinary
import cloudinary.uploader
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv
import geocoder

load_dotenv()

DB_FILE = "alerts.db"

# Cloudinary config
cloudinary.config(
    cloud_name=os.getenv("CLOUD_NAME"),
    api_key=os.getenv("CLOUD_API_KEY"),
    api_secret=os.getenv("CLOUD_API_SECRET")
)

# Firebase init
firebase_json = os.getenv("FIREBASE_CREDENTIALS", "serviceAccountKey.json")

try:
    if os.path.exists(firebase_json):
        cred = credentials.Certificate(firebase_json)
        firebase_admin.initialize_app(cred)
        firestore_db = firestore.client()
        print(f"[INFO] Firebase connected using {firebase_json}")
    else:
        print(f"[WARN] Firebase credentials file not found. Firebase disabled.")
        firestore_db = None
except Exception as e:
    print(f"[ERROR] Firebase initialization failed: {e}")
    firestore_db = None

def init_db():
    """Create or upgrade alerts table."""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()

    # Create table if not exists
    c.execute("""
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            label TEXT,
            timestamp TEXT,
            image_path TEXT UNIQUE,
            cloud_url TEXT,
            synced INTEGER DEFAULT 0,
            telegram_sent INTEGER DEFAULT 0,
            latitude REAL,
            longitude REAL,
            location TEXT
        )
    """)
    # Check for missing columns and add them
    columns = [row[1] for row in c.execute("PRAGMA table_info(alerts)").fetchall()]
    upgrades = {
        "synced": "INTEGER DEFAULT 0",
        "telegram_sent": "INTEGER DEFAULT 0",
        "latitude": "REAL",
        "longitude": "REAL",
        "location": "TEXT"
    }
    for col, col_type in upgrades.items():
        if col not in columns:
            c.execute(f"ALTER TABLE alerts ADD COLUMN {col} {col_type}")
            print(f"[DB Upgrade] Added missing column: {col}")

    conn.commit()
    conn.close()
    print("[DB] Alerts table ready with columns:", columns + list(upgrades.keys()))

def store_alert(label, img_path):
    """
    Upload to Cloudinary, store locally in SQLite, push to Firestore, and get geolocation.
    Returns cloud_url, public_id
    """
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    cloud_url = None
    public_id = None

    # Get geolocation
    try:
        g = geocoder.ip('me')
        latitude = g.latlng[0] if g.latlng else None
        longitude = g.latlng[1] if g.latlng else None
        location = g.city if g.city else "Unknown"
    except:
        latitude = longitude = None
        location = "Unknown"

    # Upload to Cloudinary
    try:
        res = cloudinary.uploader.upload(
            img_path,
            folder="wildlife_alerts",
            context={"label": label, "timestamp": timestamp}
        )
        cloud_url = res.get("secure_url")
        public_id = res.get("public_id")
        print(f"[Cloudinary] Uploaded: {cloud_url}")
    except Exception as e:
        print(f"[Cloudinary Error] {e}")

    # Store in SQLite
    try:
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        c.execute("""
            INSERT OR REPLACE INTO alerts (
                label, timestamp, image_path, cloud_url, synced, telegram_sent,
                latitude, longitude, location
            )
            VALUES (?, ?, ?, ?, ?, COALESCE((SELECT telegram_sent FROM alerts WHERE image_path = ?), 0),
                    ?, ?, ?)
        """, (label, timestamp, img_path, cloud_url, 1 if cloud_url else 0, img_path,
              latitude, longitude, location))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[SQLite Error] {e}")

    # Store in Firebase
    if firestore_db and cloud_url:
        try:
            doc_ref = firestore_db.collection("animal_alerts").document()
            doc_ref.set({
                "label": label,
                "timestamp": timestamp,
                "cloud_url": cloud_url,
                "local_path": img_path,
                "latitude": latitude,
                "longitude": longitude,
                "location": location
            })
            print(f"[Firebase] Alert stored for {label}")
        except Exception as e:
            print(f"[Firebase Error] {e}")

    return cloud_url, public_id

def get_latest_alerts(limit=20):
    """Return recent local alerts."""
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("SELECT label, timestamp, cloud_url, latitude, longitude, location FROM alerts ORDER BY id DESC LIMIT ?", (limit,))
    rows = c.fetchall()
    conn.close()
    return rows

def update_alert_status(img_path, telegram_ok=None, synced=None):
    """Update telegram_sent and/or synced flags."""
    try:
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        if telegram_ok is None and synced is None:
            conn.close()
            return
        if telegram_ok is not None and synced is not None:
            c.execute("UPDATE alerts SET telegram_sent = ?, synced = ? WHERE image_path = ?", (1 if telegram_ok else 0, 1 if synced else 0, img_path))
        elif telegram_ok is not None:
            c.execute("UPDATE alerts SET telegram_sent = ? WHERE image_path = ?", (1 if telegram_ok else 0, img_path))
        else:
            c.execute("UPDATE alerts SET synced = ? WHERE image_path = ?", (1 if synced else 0, img_path))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[SQLite update error] {e}")
