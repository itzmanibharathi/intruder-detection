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
app.post('/api/chat', async (req, res) => {
  const { message, language } = req.body;

  if (!message || !language) {
    return res.status(400).json({ error: "Message and language are required" });
  }

  try {
    // 1. Fetch all alerts from DB
    const alerts = await dbMongo.collection("animal_alerts")
      .find()
      .sort({ timestamp: -1 })
      .toArray();

    const totalAlerts = alerts.length;
    const animalCounts = {};
    const locationCounts = {};
    let lastTimestamp = null;

    alerts.forEach(alert => {
      const label = alert.animal || "Unknown";
      animalCounts[label] = (animalCounts[label] || 0) + 1;
      if (alert.location) locationCounts[alert.location] = (locationCounts[alert.location] || 0) + 1;
      if (!lastTimestamp || alert.timestamp > lastTimestamp) lastTimestamp = alert.timestamp;
    });

    const mostFrequentAnimal = Object.entries(animalCounts).reduce((a, b) => a[1] > b[1] ? a : b, ["Unknown", 0])[0];
    const mostFrequentLocation = Object.entries(locationCounts).reduce((a, b) => a[1] > b[1] ? a : b, ["Not specified", 0])[0];
    const lastAlert = lastTimestamp ? `Last alert: ${Math.floor((Date.now() - new Date(lastTimestamp))/60000)} minutes ago.` : "No alerts yet.";

    // 2. Prepare strong system prompt
    const systemPrompt = `
You are an AI assistant for the Animal Patrol app.
User queries might be vague or have grammatical errors.
Auto-correct the user input internally.
Reply in ${language} only.
Provide accurate, concise answers based on this data:
- Total alerts: ${totalAlerts}
- Most frequent animal: ${mostFrequentAnimal}
- Most frequent location: ${mostFrequentLocation}
- Last alert: ${lastAlert}
- Locations of alerts: ${Object.keys(locationCounts).join(", ") || "Not specified"}
Focus on user question, provide direct answers, do not repeat generic tips.
`;

    // 3. Ask the AI
    const completion = await openai.chat.completions.create({
      model: "meta-instruct-0b", // fast free tier
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      temperature: 0.3, // low temp for accurate answers
      max_tokens: 300,
    });

    const reply = completion.choices[0].message.content;

    res.json({ reply });
  } catch (err) {
    console.error("❌ Error in /api/chat:", err);
    res.status(500).json({ error: "AI response failed" });
  }
});


// ===============================
// START SERVER
// ===============================
app.listen(PORT, () => console.log(`Server running on port ${PORT} ✅`));
