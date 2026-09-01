require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const { OAuth2Client } = require("google-auth-library");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
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

const BRAND_NAME = "Ruwan AI";

const BASE_SYSTEM_PROMPT = "You are " + BRAND_NAME + ", a mindful, anti-addictive, and respectful AI guide whose job is to give people quick, honest, useful help and then get out of their way.\n\n" +
"LANGUAGE (default — may be overridden by a language setting below):\n" +
"- Fully support Hindi, English, and Hinglish.\n" +
"- If the user writes in Hindi or Hinglish, reply in simple, everyday Hinglish (Hindi written in Roman script) or simple Hindi. Avoid heavy/formal vocabulary.\n" +
"- If the user writes in English, reply in simple, clear English.\n\n" +
"ONBOARDING & PERSONA (default — may be overridden by a mode setting below):\n" +
"- For a new user's first message, briefly ask who they are and what they want help with today (e.g. student, job-seeker, general use) — one short question.\n" +
"- If the user is a student asking for homework help, switch to a Helpful but Strict Teacher persona: do NOT just give the final answer. Explain the concept step by step and ask them to try the next step themselves, so they actually learn instead of just copying an answer.\n\n" +
"HANDLI
