import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!MONGO_URI || !OPENROUTER_API_KEY) {
  console.error("❌ MONGO_URI or OPENROUTER_API_KEY missing in env");
  process.exit(1);
}

// ===============================
// MongoDB Init
// ===============================
const mongoClient = new MongoClient(MONGO_URI);
let dbMongo;

mongoClient.connect()
  .then(() => {
    dbMongo = mongoClient.db();
    console.log("✅ Connected to MongoDB");
  })
  .catch(err => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

// ===============================
// Express Init
// ===============================
const app = express();
app.use(cors());
app.use(express.json());

// ===============================
// Health Check
// ===============================
app.get("/", (req, res) => res.json({ status: "Backend running ✅" }));

// ===============================
// Save Alert
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
    res.json({ message: "Alert saved successfully", id: result.insertedId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// Fetch Recent Alerts
// ===============================
app.get("/alerts", async (req, res) => {
  try {
    const alerts = await dbMongo.collection("animal_alerts")
      .find()
      .sort({ timestamp: -1 })
      .limit(20)
      .toArray();
    res.json(alerts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// Analytics
// ===============================
app.get("/analytics/today", async (req, res) => {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const count = await dbMongo.collection("animal_alerts").countDocuments({ timestamp: { $gte: start } });
    res.json({ count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/analytics/last7days", async (req, res) => {
  try {
    const start = new Date();
    start.setDate(start.getDate() - 7);

    const alerts = await dbMongo.collection("animal_alerts").find({ timestamp: { $gte: start } }).toArray();
    const result = {};
    alerts.forEach(alert => {
      result[alert.animal] = (result[alert.animal] || 0) + 1;
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/analytics/range", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ error: "Provide startDate and endDate" });

    const start = new Date(startDate);
    const end = new Date(endDate);

    const count = await dbMongo.collection("animal_alerts").countDocuments({ timestamp: { $gte: start, $lte: end } });
    res.json({ count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// Fetch Single Alert
// ===============================
app.get("/alert/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const alert = await dbMongo.collection("animal_alerts").findOne({ _id: new ObjectId(id) });

    if (!alert) return res.status(404).json({ error: "Alert not found" });
    res.json(alert);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// Summary function
// ===============================
async function getAnimalSummary() {
  const alerts = await dbMongo.collection("animal_alerts").find().toArray();
  const totalAlerts = alerts.length;
  const animalCounts = {};
  alerts.forEach(alert => {
    animalCounts[alert.animal] = (animalCounts[alert.animal] || 0) + 1;
  });
  const mostFrequent = Object.entries(animalCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || "None";
  return `Animal detections: ${totalAlerts}. Most frequent: ${mostFrequent}.`;
}

// ===============================
// Chat with OpenRouter
// ===============================
app.post("/api/chat", async (req, res) => {
  try {
    const { message, language } = req.body;
    const summary = await getAnimalSummary();

    const prompt = `
Reply ONLY in ${language}.
Keep it short and simple.
Based on: ${summary}.
Give forest safety and animal intrusion prevention tips.
`;

    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "mpt-7b-chat",
        messages: [{ role: "user", content: prompt }]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    );

    const reply = response.data.choices[0].message.content;
    res.json({ reply });

  } catch (err) {
    console.error("❌ OpenRouter error:", err.response?.data || err.message);
    // Fallback for free/demo
    res.json({
      reply: "AI temporarily unavailable. Ensure fencing, lights, and regular patrols."
    });
  }
});

// ===============================
// Start Server
// ===============================
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
