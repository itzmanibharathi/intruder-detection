import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

/* ===============================
   CONFIG
================================ */
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!MONGO_URI) {
  console.error("❌ MONGO_URI missing in env");
  process.exit(1);
}
if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY missing in env");
  process.exit(1);
}

/* ===============================
   EXPRESS INIT
================================ */
const app = express();
app.use(cors());
app.use(express.json());

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
    console.error("❌ MongoDB error:", err);
    process.exit(1);
  });

/* ===============================
   GEMINI INIT
================================ */
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

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
    const alert = {
      animal: req.body.animal || "unknown",
      confidence: req.body.confidence || 0,
      location: req.body.location || null,
      latitude: req.body.latitude || null,
      longitude: req.body.longitude || null,
      timestamp: new Date(),
    };

    const result = await dbMongo
      .collection("animal_alerts")
      .insertOne(alert);

    res.json({ message: "Alert saved", id: result.insertedId });
  } catch (err) {
    console.error("❌ Save alert error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   FETCH ALERTS
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
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   HELPER: SUMMARY
================================ */
async function getAnimalSummary() {
  const alerts = await dbMongo.collection("animal_alerts").find().toArray();

  if (!alerts.length) {
    return "No animal alerts available.";
  }

  const total = alerts.length;
  const animals = {};
  const locations = {};
  let lastTime = null;

  alerts.forEach((a) => {
    animals[a.animal] = (animals[a.animal] || 0) + 1;
    if (a.location) {
      locations[a.location] = (locations[a.location] || 0) + 1;
    }
    if (!lastTime || a.timestamp > lastTime) {
      lastTime = a.timestamp;
    }
  });

  return `
Total alerts: ${total}
Animals count: ${JSON.stringify(animals)}
Locations: ${JSON.stringify(locations)}
Last alert time: ${lastTime ? lastTime.toISOString() : "Not available"}
`;
}

/* ===============================
   CHAT API (GEMINI FREE)
================================ */
app.post("/api/chat", async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ reply: "Message required" });
  }

  try {
    const summary = await getAnimalSummary();

    const prompt = `
You are an AI assistant for an animal intrusion detection system.

RULES:
- Detect the user's language automatically
- Reply ONLY in the same language
- Fix grammar silently
- Keep replies SHORT and DIRECT
- Answer ONLY what is asked
- If data not available, say "Not available"

SYSTEM DATA:
${summary}

USER QUESTION:
${message}
`;

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash-latest",
    });

    const result = await model.generateContent(prompt);
    const reply = result.response.text().trim();

    res.json({ reply });
  } catch (err) {
    console.error("❌ Gemini error:", err);
    res.json({
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
