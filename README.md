
# 🦁 Wild Animal Intrusion Detection System  
**Real-time YOLOv8 Detection + Local Database Storage + Firebase Sync + Cloudinary Image Backup**
<p align="center">
  <!-- YOLOv8 Logo -->
  <img src="https://github.com/user-attachments/assets/5f31acfe-4466-41cb-bd7a-f12905bbcb81" alt="YOLOv8 Logo" width="240" />
</p>

<p align="center">
  <!-- Tech Stack Badges -->
  <img src="https://img.shields.io/badge/Python-3.10+-yellow" />
  <img src="https://img.shields.io/badge/Firebase-Realtime%20DB-orange" />
  <img src="https://img.shields.io/badge/SQLite-Local%20DB-blue" />
  <img src="https://img.shields.io/badge/Cloudinary-Cloud%20Storage-lightblue" />
  <img src="https://img.shields.io/badge/React%20Native-Mobile%20Dashboard-brightgreen" />
</p>

---

## 📌 Project Overview

This project detects **wild animals** in real-time using **YOLOv8 (Ultralytics)** on an edge device like:

- ✅ Raspberry Pi / Jetson Nano / PC  
- ✅ Works offline (no internet required)

🟢 When **internet is NOT available** → data & images are stored **locally** (SQLite + local disk).

🌐 When **internet becomes available** → queued detections automatically sync to:

| Service | Purpose |
|---------|----------|
| **Firebase** | Stores detection metadata (timestamp, animal type, confidence, GPS, etc.) |
| **Cloudinary** | Stores captured images in the cloud |

You can later build a **React Native mobile dashboard** to see analytics, animal activity history, and images.

---

## 🚀 Features

| Feature | Description |
|--------|-------------|
| 🔍 Real-time detection | Detects animals using YOLOv8 model (trained dataset) |
| 💾 Offline-first storage | Saves data + images locally when offline |
| ☁️ Cloud sync | Auto-upload to Firebase & Cloudinary when internet is back |
| 📸 Image capture | Saves detection frame when confidence threshold is met |
| 🔁 Sync queue | Prevents data loss even in long offline periods |
| 📱 React Native Dashboard (to be developed) | Will show analytics, charts, event feed |
| 🧠 Multiple animal class support | e.g., Elephant, Tiger, Deer, Wild Boar, etc. |

---

## 🏗️ System Architecture

```

```
              ┌──────────────┐
              │   Camera      │
              └──────┬───────┘
                     ▼
              ┌──────────────┐
              │ YOLOv8 Model │
              └──────┬───────┘
 Animal Detected? ────Yes─────┐
                               ▼
                     ┌────────────┐
        Local Save → │ SQLite DB  │ ← stores data
                     └────────────┘
                          │
                          │ When Internet Available
                          ▼
      ┌─────────────── Cloud Sync ───────────────┐
      ▼                                           ▼
```

┌─────────────┐                         ┌──────────────────┐
│ Firebase     │                         │ Cloudinary Image │
│ metadata     │                         │   storage        │
└─────────────┘                         └──────────────────┘

```
                    ▼
       (Future) React Native Dashboard
```

```

---

## 🛠️ Tech Stack

| Component | Technology Used |
|----------|------------------|
| **AI model** | YOLOv8 – Ultralytics |
| **Backend Script** | Python |
| **Local DB** | SQLite3 |
| **Cloud Storage** | Cloudinary |
| **Cloud Database** | Firebase (Realtime Database) |
| **Dashboard (future)** | React Native / Expo |

---

## 🗂️ Project Structure

```
## YOLOv8 model :
https://drive.google.com/file/d/1QdEC9OQ3OEoBJzVlEU6Szl3Q7LOu8LcJ/view?usp=sharing

wild-animal-detection/
│
├── detect.py                # YOLOv8 detection + DB sync logic
├── database.py              # SQLite DB handling
├── firebase_sync.py         # Push to Firebase + Cloudinary
├── models/
│     └── best.pt            # Trained YOLOv8 model
├── images/
│     └── detections/        # Saved detection snapshots
└── requirements.txt

````

---

## ⚙️ How It Works

### 🔹 1. YOLO Detects animal
```python
results = model(frame)
````

### 🔹 2. Save detection to SQLite (offline-safe)

```python
INSERT INTO detections (animal, confidence, img_path)
```

### 🔹 3. If Internet Available → Sync to Firebase

```python
firebase.push()
cloudinary.upload()
```

---

## 🧪 Run the Project

### ✅ Install dependencies

```bash
pip install -r requirements.txt
```

### ✅ Run detection

```bash
python detect.py
```

---

## 📦 `requirements.txt`

```
ultralytics
opencv-python
firebase-admin
cloudinary
sqlite3 (built-in)
```

---

## 🧑‍💻 Firebase Setup

1. Create Firebase project
2. Enable **Realtime Database**
3. Download serviceAccountKey.json
4. Add it to project root

---

## 🌩️ Cloudinary Setup

1. Create account on Cloudinary
2. Copy API credentials
3. Add to `.env`:

```
CLOUDINARY_CLOUD_NAME=xxxx
CLOUDINARY_API_KEY=xxxx
CLOUDINARY_API_SECRET=xxxx
```

---

## 📱 React Native Dashboard (Coming Soon)

* Live alert screen
* Detection gallery
* Analytics (charts: daily / weekly animal activity)
* Push notification on detection

---

## 🏁 Current Stage

✅ Model trained
✅ Detection working
✅ Local storage working
✅ Firebase sync working

🔜 Next phase: **Building React Native Dashboard**

---

## ✨ Future Enhancements

| Feature                  | Status    |
| ------------------------ | --------- |
| SMS / WhatsApp alert     | ⏳ Planned |
| Geofencing + GPS mapping | ⏳ Planned |
| Web dashboard analytics  | ⏳ Planned |

---
