import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

// ===============================
// CONFIG
// ===============================
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI missing in .env");
  process.exit(1);
}

// ===============================
// MONGODB INIT
// ===============================
const mongoClient = new MongoClient(MONGO_URI);
let dbMongo;

mongoClient.connect()
  .then(() => {
    dbMongo = mongoClient.db(); // default DB from URI
    console.log("✅ Connected to MongoDB");
  })
  .catch(err => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// ===============================
// EXPRESS INIT
// ===============================
const app = express();
app.use(cors());
app.use(express.json());

// ===============================
// HEALTH CHECK
// ===============================
app.get("/", (req, res) => res.json({ status: "Backend running ✅" }));

// ===============================
// SAVE ALERT
// ===============================
app.post("/alert", async (req, res) => {
  try {
    const { animal, confidence, imageUrl, location, latitude, longitude, timestamp } = req.body;

    if (!animal || !confidence) return res.status(400).json({ error: "Invalid data" });

    const alertData = {
      animal,
      confidence,
      imageUrl: imageUrl || null,
      location: location || null,
      latitude: latitude || null,
      longitude: longitude || null,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
    };

    const result = await dbMongo.collection("animal_alerts").insertOne(alertData);
    console.log("✅ Alert saved:", result.insertedId);

    res.json({ message: "Alert saved successfully", id: result.insertedId });
  } catch (err) {
    console.error("❌ Error saving alert:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// FETCH RECENT ALERTS
// ===============================
app.get("/alerts", async (req, res) => {
  try {
    const alerts = await dbMongo.collection("animal_alerts")
      .find()
      .sort({ timestamp: -1 })
      .limit(20)
      .toArray();

    console.log(`✅ Fetched ${alerts.length} alerts`);
    res.json(alerts);
  } catch (err) {
    console.error("❌ Error fetching alerts:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// ANALYTICS: Today
// ===============================
app.get("/analytics/today", async (req, res) => {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const count = await dbMongo.collection("animal_alerts")
      .countDocuments({ timestamp: { $gte: start } });

    console.log(`📊 Today analytics: ${count} alerts`);
    res.json({ count });
  } catch (err) {
    console.error("❌ Error in today analytics:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// ANALYTICS: Last 7 Days
// ===============================
app.get("/analytics/last7days", async (req, res) => {
  try {
    const start = new Date();
    start.setDate(start.getDate() - 7);

    const alerts = await dbMongo.collection("animal_alerts")
      .find({ timestamp: { $gte: start } })
      .toArray();

    const result = {};
    alerts.forEach(alert => {
      result[alert.animal] = (result[alert.animal] || 0) + 1;
    });

    console.log("📊 Last 7 days analytics:", result);
    res.json(result);
  } catch (err) {
    console.error("❌ Error in last 7 days analytics:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// ANALYTICS: Custom Range
// ===============================
app.get("/analytics/range", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ error: "Provide startDate and endDate" });

    const start = new Date(startDate);
    const end = new Date(endDate);

    const count = await dbMongo.collection("animal_alerts")
      .countDocuments({ timestamp: { $gte: start, $lte: end } });

    console.log(`📊 Custom range analytics: ${count} alerts between ${startDate} and ${endDate}`);
    res.json({ count });
  } catch (err) {
    console.error("❌ Error in custom range analytics:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// FETCH SINGLE ALERT
// ===============================
app.get("/alert/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const alert = await dbMongo.collection("animal_alerts").findOne({ _id: new ObjectId(id) });

    if (!alert) return res.status(404).json({ error: "Alert not found" });

    res.json(alert);
  } catch (err) {
    console.error("❌ Error fetching alert:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// START SERVER
// ===============================
app.listen(PORT, () => console.log(`Server running on port ${PORT} ✅`));
