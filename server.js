require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const fs = require("fs");
const { OAuth2Client } = require("google-auth-library");
const mongoose = require("mongoose");

const MONGODB_URI = process.env.MONGODB_URI;

if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log("MongoDB connected successfully"))
    .catch((err) => console.error("MongoDB connection error:", err));
} else {
  console.warn("MONGODB_URI not set — database features disabled.");
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static("public"));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3.6-flash";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const authClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

app.get("/api/config", (req, res) => {
  res.json({ googleClientId: GOOGLE_CLIENT_ID || null });
});

async function verifyGoogleToken(idToken) {
  if (!authClient) return null;
  try {
    const ticket = await authClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });
    return ticket.getPayload();
  } catch (err) {
    return null;
  }
}

function readPromptFile(filename) {
  try {
    return fs.readFileSync(filename, "utf8").trim();
  } catch (err) {
    return "";
  }
}

const BRAND_NAME = "Ruwan AI";
const BASE_SYSTEM_PROMPT = readPromptFile("prompt.txt");

const LANGUAGE_FILES = {
  auto: null,
  english: "lang-english.txt",
  hindi: "lang-hindi.txt",
};

const MODE_FILES = {
  general: null,
  professional: "mode-professional.txt",
  college: "mode-college.txt",
  research: "mode-research.txt",
  navigation: "mode-navigation.txt",
  career: "mode-career.txt",
  learning: "mode-learning.txt",
};

const SEARCH_ENABLED_MODES = {
  research: true,
  college: true,
  navigation: true,
  career: true,
  learning: true,
};

function buildSystemPrompt(language, mode) {
  const parts = [BASE_SYSTEM_PROMPT];
  const langFile = LANGUAGE_FILES[language];
  if (langFile) parts.push(readPromptFile(langFile));
  const modeFile = MODE_FILES[mode];
  if (modeFile) parts.push(readPromptFile(modeFile));
  parts.push(readPromptFile("youtube-suggestion.txt"));
  return parts.filter(Boolean).join("\n\n");
}

app.post("/api/chat", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "Server not configured: missing GEMINI_API_KEY." });
    }

    if (authClient) {
      const idToken = req.body.idToken;
      if (!idToken) {
        return res.status(401).json({ error: "Please sign in with Google to chat." });
      }
      const payload = await verifyGoogleToken(idToken);
      if (!payload) {
        return res.status(401).json({ error: "Your sign-in has expired. Please sign in again." });
      }
    }

    const messages = req.body.messages;
    const language = req.body.language;
    const mode = req.body.mode;
    const image = req.body.image;
