import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import axios from "axios";

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
app.get("/", (req, res) => {
  res.json({ status: "Backend running ✅" });
});

// ===============================
// SAVE ALERT
// ===============================
app.post("/alert", async (req, res) => {
  try {
    const {
      animal,
      confidence,
      imageUrl,
      location,
      latitude,
      longitude,
      timestamp
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

// ===============================
// ANALYTICS: Today
// ===============================
app.get("/analytics/today", async (req, res) => {
  try {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const count = await dbMongo
      .collection("animal_alerts")
      .countDocuments({ timestamp: { $gte: start } });

    res.json({ count });
  } catch (err) {
    console.error("❌ Analytics error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ===============================
// SUMMARY FUNCTION
// ===============================
async function getAnimalSummary() {
  const alerts = await dbMongo
    .collection("animal_alerts")
    .find()
    .toArray();

  const totalAlerts = alerts.length;
  const animalCounts = {};

  alerts.forEach(alert => {
    animalCounts[alert.animal] = (animalCounts[alert.animal] || 0) + 1;
  });

  const mostFrequent =
    Object.entries(animalCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "None";

  return `Animal detections: ${totalAlerts}. Most frequent: ${mostFrequent}.`;
}

// ===============================
// CHAT (GROK API)
// ===============================
app.post("/api/chat", async (req, res) => {
  try {
    const { message, language } = req.body;
    console.log("📩 Chat request:", message, language);

    const summary = await getAnimalSummary();

    const systemPrompt = `
You are an AI assistant for AnimalPatrol.
Reply ONLY in ${language}.
Keep replies short and simple.
Base answers on this data: ${summary}.
Give forest safety and animal intrusion prevention tips.
`;

    const response = await axios.post(
      "https://api.x.ai/v1/chat/completions",
      {
        model: "grok-4",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ],
        stream: false,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.XAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 60000,
      }
    );

    const reply = response.data.choices[0].message.content;
    console.log("✅ Grok reply sent");

    res.json({ reply });

  } catch (error) {
    console.error("❌ Grok API error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to get AI response" });
  }
});

// ===============================
// START SERVER
// ===============================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
