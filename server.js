import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

/* ===============================
   CONFIG
================================ */
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI missing in .env");
  process.exit(1);
}
if (!OPENROUTER_API_KEY) {
  console.error("❌ OPENROUTER_API_KEY missing in .env");
}

/* ===============================
   MONGODB INIT
================================ */
const mongoClient = new MongoClient(MONGO_URI);
let dbMongo;

mongoClient
  .connect()
  .then(() => {
    dbMongo = mongoClient.db();
    console.log("✅ Connected to MongoDB");
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

/* ===============================
   EXPRESS INIT
================================ */
const app = express();
app.use(cors());
app.use(express.json());

/* ===============================
   HEALTH CHECK
================================ */
app.get("/", (req, res) => {
  res.json({ status: "Backend running ✅" });
});

/* ===============================
   SAVE ALERT
================================ */
app.post("/alert", async (req, res) => {
  try {
    const {
      animal,
      confidence,
      imageUrl,
      location,
      latitude,
      longitude,
      timestamp,
    } = req.body;

    if (!animal || !confidence) {
      return res.status(400).json({ error: "Invalid data" });
    }

    const alertData = {
      animal,
      confidence,
      imageUrl: imageUrl || null,
      location: location || null,
      latitude: latitude || null,
      longitude: longitude || null,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
    };

    const result = await dbMongo
      .collection("animal_alerts")
      .insertOne(alertData);

    res.json({ message: "Alert saved successfully", id: result.insertedId });
  } catch (err) {
    console.error("❌ Error saving alert:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   FETCH RECENT ALERTS
================================ */
app.get("/alerts", async (req, res) => {
  try {
    const alerts = await dbMongo
      .collection("animal_alerts")
      .find()
      .sort({ timestamp: -1 })
      .limit(20)
      .toArray();

    res.json(alerts);
  } catch (err) {
    console.error("❌ Error fetching alerts:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   ANALYTICS: TODAY
================================ */
app.get("/analytics/today", async (req, res) => {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const count = await dbMongo
      .collection("animal_alerts")
      .countDocuments({ timestamp: { $gte: start } });

    res.json({ count });
  } catch (err) {
    console.error("❌ Error in today analytics:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   ANALYTICS: LAST 7 DAYS
================================ */
app.get("/analytics/last7days", async (req, res) => {
  try {
    const start = new Date();
    start.setDate(start.getDate() - 7);

    const alerts = await dbMongo
      .collection("animal_alerts")
      .find({ timestamp: { $gte: start } })
      .toArray();

    const result = {};
    alerts.forEach((alert) => {
      result[alert.animal] = (result[alert.animal] || 0) + 1;
    });

    res.json(result);
  } catch (err) {
    console.error("❌ Error in last 7 days analytics:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   ANALYTICS: CUSTOM RANGE
================================ */
app.get("/analytics/range", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: "Provide startDate and endDate" });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    const count = await dbMongo
      .collection("animal_alerts")
      .countDocuments({
        timestamp: { $gte: start, $lte: end },
      });

    res.json({ count });
  } catch (err) {
    console.error("❌ Error in custom range analytics:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   FETCH SINGLE ALERT
================================ */
app.get("/alert/:id", async (req, res) => {
  try {
    const alert = await dbMongo
      .collection("animal_alerts")
      .findOne({ _id: new ObjectId(req.params.id) });

    if (!alert) return res.status(404).json({ error: "Alert not found" });

    res.json(alert);
  } catch (err) {
    console.error("❌ Error fetching alert:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   HELPER: DATA SUMMARY
================================ */
async function getAnimalSummary() {
  const alerts = await dbMongo
    .collection("animal_alerts")
    .find()
    .toArray();

  if (!alerts.length) return "No animal alerts available.";

  const total = alerts.length;
  const animals = {};
  const locations = {};

  alerts.forEach((a) => {
    if (a.animal) animals[a.animal] = (animals[a.animal] || 0) + 1;
    if (a.location)
      locations[a.location] = (locations[a.location] || 0) + 1;
  });

  return `
Total alerts: ${total}.
Animals detected: ${JSON.stringify(animals)}.
Locations: ${JSON.stringify(locations)}.
`;
}

/* ===============================
   CHAT API (OPENROUTER – META FREE)
================================ */
app.post("/api/chat", async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    const summary = await getAnimalSummary();

    const systemPrompt = `
You are an AI assistant for an animal intrusion detection system.

Rules:
- Detect the user's language automatically.
- Reply in the same language.
- Correct grammar silently.
- Answer only what the user asks.
- Keep answers short and factual.
- If information is missing, say "Not available".

Data:
${summary}
`;

    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "meta-llama/llama-3.1-8b-instruct:free",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        temperature: 0.6,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://intruder-detection.onrender.com",
          "X-Title": "Intruder Detection App",
        },
      }
    );

    const reply =
      response.data?.choices?.[0]?.message?.content ||
      "No response available";

    res.json({ reply });
  } catch (err) {
    console.error("❌ OpenRouter error:", err.response?.data || err.message);
    res.status(500).json({
      reply: "AI service temporarily unavailable. Please try again.",
    });
  }
});

/* ===============================
   START SERVER
================================ */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
