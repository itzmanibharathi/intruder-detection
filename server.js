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
  console.error("❌ MONGO_URI missing");
  process.exit(1);
}

if (!GEMINI_API_KEY) {
  console.error("❌ GEMINI_API_KEY missing");
}

/* ===============================
   MONGODB INIT
================================ */
const mongoClient = new MongoClient(MONGO_URI);
let dbMongo;

mongoClient.connect()
  .then(() => {
    dbMongo = mongoClient.db();
    console.log("✅ MongoDB connected");
  })
  .catch(err => {
    console.error("❌ MongoDB error:", err);
    process.exit(1);
  });

/* ===============================
   EXPRESS INIT
================================ */
const app = express();
app.use(cors());
app.use(express.json());

/* ===============================
   HEALTH
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

    res.json({ message: "Alert saved", id: result.insertedId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===============================
   FETCH ALERTS
================================ */
app.get("/alerts", async (req, res) => {
  const alerts = await dbMongo
    .collection("animal_alerts")
    .find()
    .sort({ timestamp: -1 })
    .limit(20)
    .toArray();
  res.json(alerts);
});

/* ===============================
   ANALYTICS HELPERS
================================ */
async function getAnimalSummary() {
  const alerts = await dbMongo.collection("animal_alerts").find().toArray();

  if (!alerts.length) return "No animal alerts available.";

  const total = alerts.length;
  const animals = {};
  const locations = {};

  alerts.forEach(a => {
    if (a.animal) animals[a.animal] = (animals[a.animal] || 0) + 1;
    if (a.location) locations[a.location] = (locations[a.location] || 0) + 1;
  });

  return `
Total alerts: ${total}
Animals: ${JSON.stringify(animals)}
Locations: ${JSON.stringify(locations)}
`;
}
/* ===============================
   CHAT API (HUGGING FACE – FREE)
================================ */
app.post("/api/chat", async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.json({ reply: "Message required" });
  }

  try {
    const summary = await getAnimalSummary();

    const prompt = `
You are an AI assistant for an animal intrusion detection system.

Rules:
- Detect user language automatically
- Reply in the SAME language
- Correct grammar silently
- Short, clear answers only
- Answer ONLY what is asked
- If information is missing, say "Not available"

DATA:
${summary}

USER QUESTION:
${message}
`;

    const response = await axios.post(
      "https://api-inference.huggingface.co/models/meta-llama/Llama-3.1-8B-Instruct",
      {
        inputs: prompt,
        parameters: {
          max_new_tokens: 120,
          temperature: 0.5,
          return_full_text: false
        }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.HF_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 60000
      }
    );

    const reply =
      response.data?.[0]?.generated_text?.trim() ||
      "Not available";

    res.json({ reply });
  } catch (err) {
    console.error("❌ HuggingFace error:", err.response?.data || err.message);
    res.json({
      reply: "AI service temporarily unavailable. Please try again."
    });
  }
});

/* ===============================
   START SERVER
================================ */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
