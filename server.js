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
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!MONGO_URI) throw new Error("MONGO_URI missing in .env");
if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY missing in .env");

// ===============================
// MONGODB INIT
// ===============================
const mongoClient = new MongoClient(MONGO_URI);
let dbMongo;

await mongoClient.connect();
dbMongo = mongoClient.db();
console.log("✅ Connected to MongoDB");

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
// CHAT ENDPOINT WITH OPENROUTER
// ===============================
app.post("/api/chat", async (req, res) => {
  try {
    const { message, language } = req.body;

    if (!message) {
      return res.json({ reply: "Please ask a question." });
    }

    // ===== Fetch alerts =====
    const alerts = await dbMongo
      .collection("animal_alerts")
      .find()
      .sort({ timestamp: -1 })
      .toArray();

    const total = alerts.length;

    let lastTime = null;
    const animalCount = {};
    const locationCount = {};

    alerts.forEach(a => {
      const animal = a.animal || "Unknown";
      animalCount[animal] = (animalCount[animal] || 0) + 1;

      if (a.location) {
        locationCount[a.location] = (locationCount[a.location] || 0) + 1;
      }

      if (!lastTime || a.timestamp > lastTime) lastTime = a.timestamp;
    });

    const mostAnimal =
      Object.entries(animalCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "Unknown";

    const mostLocation =
      Object.entries(locationCount).sort((a, b) => b[1] - a[1])[0]?.[0] || "Not specified";

    const lastAlert =
      lastTime ? `${Math.floor((Date.now() - new Date(lastTime)) / 60000)} minutes ago` : "No alerts";

    // ===== SYSTEM PROMPT =====
    const systemPrompt = `
You are an AI assistant for an animal intrusion monitoring system.

Tasks:
1. Detect the user's input language automatically.
2. Fix spelling and grammar internally.
3. Understand weak or broken questions.
4. Answer ONLY what is asked.
5. Do NOT repeat previous answers.
6. Keep replies short and factual.
7. Translate the FINAL answer to this language: ${language}

System data:
- Total alerts: ${total}
- Most detected animal: ${mostAnimal}
- Most common location: ${mostLocation}
- Last alert time: ${lastAlert}
`;

    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "meta-llama/llama-3.1-8b-instruct:free",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ],
        temperature: 0.6,
        max_tokens: 180
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reply = response.data.choices[0].message.content.trim();
    res.json({ reply });

  } catch (err) {
    console.error("❌ AI ERROR:", err.response?.data || err.message);
    res.json({
      reply: "AI service temporarily unavailable. Please try again."
    });
  }
});

// ===============================
// START SERVER
// ===============================
app.listen(PORT, () => console.log(`Server running on port ${PORT} ✅`));
