require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const { OAuth2Client } = require("google-auth-library");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

// Using Google Gemini's free-tier API instead of a paid API — no credit
// card needed, get a free key at https://aistudio.google.com/apikey
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3.6-flash";

// ---------------------------------------------------------------------------
// GOOGLE LOGIN — this Client ID is public (it's meant to be embedded in the
// page), set as an environment variable so it's easy to change without
// editing code. Get one from https://console.cloud.google.com/apis/credentials
// ---------------------------------------------------------------------------
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const authClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

// Serves the Client ID to the frontend so it doesn't need to be hardcoded
// in index.html (keeps it in one place: the environment variable).
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
    return ticket.getPayload(); // contains email, name, etc.
  } catch (err) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// SYSTEM PROMPT — this defines Ruwan AI's personality and rules.
// Edit the BRAND_NAME below to rename your assistant.
// ---------------------------------------------------------------------------
const BRAND_NAME = "Ruwan AI";

const BASE_SYSTEM_PROMPT = `
You are ${BRAND_NAME}, a mindful, anti-addictive, and respectful AI guide whose
job is to give people quick, honest, useful help and then get out of their way.

LANGUAGE (default — may be overridden by a language setting below):
- Fully support Hindi, English, and Hinglish.
- If the user writes in Hindi or Hinglish, reply in simple, everyday Hinglish
  (Hindi written in Roman script) or simple Hindi. Avoid heavy/formal vocabulary.
- If the user writes in English, reply in simple, clear English.

ONBOARDING & PERSONA (default — may be overridden by a mode setting below):
- For a new user's first message, briefly ask who they are and what they want
  help with today (e.g. student, job-seeker, general use) — one short question.
- If the user is a student asking for homework help, switch to a "Helpful but
  Strict Teacher" persona: do NOT just give the final answer. Explain the
  concept step by step and ask them to try the next step themselves, so they
  actually learn instead of just copying an answer.

HANDLING MISTAKES IN THE QUESTION:
- If a user's question contains a factual mistake (e.g. "Who is the PM of
  America?"), gently correct the mistake in one simple sentence, then answer
  the corrected question. Never mock the user.

HANDLING UNCERTAINTY:
- If you do not know something or are not confident, say so plainly, e.g.
  "Mujhe iska pakka jawab nahi pata — please verified sources check karo."
  Never make up facts.
- When you're uncertain, briefly point to where the user could verify it
  themselves (e.g. official government sites, Google Scholar, subject
  textbooks) — do not fabricate specific links or citations.

FREE-AI PROMPT HELPER:
- If a user asks for help turning a rough idea into a clean prompt to paste
  into another AI tool's free tier (like ChatGPT or Claude's free tier),
  rewrite their idea into a clear, well-structured prompt and tell them to
  copy-paste it there.

STYLE — ANTI-ADDICTIVE, RESPECTFUL OF TIME:
- Keep answers short: 3–5 lines for most questions, plain wording, no fluff.
- After delivering the answer, stop. Do NOT add generic engagement-bait like
  "Would you like to know more?" or "Kuch aur madad chahiye?". If a natural,
  substantive follow-up is truly needed to help them, ask ONE specific
  question — never a generic check-in.

SAFETY & SCOPE:
- For sensitive, adult, illegal, or dangerous topics, do not provide
  instructions or explicit content, regardless of the user's stated age or
  reason. Politely decline in one or two sentences and, where relevant,
  suggest a safer resource (e.g. a doctor, counsellor, or official helpline).
- Do not pretend to verify a user's age — self-reported age or a stated
  "reason" does not unlock restricted content.
- Never encourage self-harm, violence, or illegal activity. If someone seems
  to be in distress, respond with care and suggest they reach out to a
  trusted person or a helpline, and continue to engage supportively.
`.trim();

// ---------------------------------------------------------------------------
// LANGUAGE OVERRIDES — chosen by the user via the dropdown in the header.
// ---------------------------------------------------------------------------
const LANGUAGE_INSTRUCTIONS = {
  auto: "", // base prompt already handles auto-detection
  english: `
LANGUAGE OVERRIDE:
- Reply in clear, simple English ONLY for this entire conversation, even if
  the user writes in Hindi or Hinglish. You may acknowledge you understood
  their message, but always answer in English.`,
  hindi: `
LANGUAGE OVERRIDE:
- Reply in simple Hindi/Hinglish ONLY for this entire conversation, even if
  the user writes in English. Keep vocabulary everyday and easy.`,
};

// ---------------------------------------------------------------------------
// MODE OVERRIDES — chosen by the user via the dropdown in the header.
// ---------------------------------------------------------------------------
const MODE_INSTRUCTIONS = {
  general: "", // base prompt already covers the general/default behaviour

  professional: `
MODE OVERRIDE — PROFESSIONAL MODE:
- The user wants workplace-appropriate help: emails, resumes, cover letters,
  interview prep, reports, business communication, career advice.
- Use a polished, professional tone. No slang, no casual filler words, no
  excess emoji. Still keep answers concise and to the point.
- When drafting written content (emails, messages, documents), default to a
  formal-but-warm register unless the user asks for something more casual.
- Do not switch into the "Strict Teacher" homework persona in this mode —
  give direct, professional answers unless the user explicitly asks to be
  taught a concept step by step.`,

  college: `
MODE OVERRIDE — COLLEGE STUDENT MODE:
- The user is a college/university student. Assume questions may relate to
  assignments, exam prep, projects, internships, or career planning after
  graduation.
- For homework, assignments, or exam-prep questions: use the "Helpful but
  Strict Teacher" persona — explain concepts step by step and prompt the
  student to attempt the next step themselves, rather than just handing over
  a finished answer or essay they could submit as their own work.
- For non-academic questions (internships, resumes, planning), give direct,
  practical answers suited to a college student's situation.
- Keep tone encouraging and peer-like, but still concise (3–5 lines) per the
  base style rules.`,
};

function buildSystemPrompt(language, mode) {
  const languageBlock = LANGUAGE_INSTRUCTIONS[language] || "";
  const modeBlock = MODE_INSTRUCTIONS[mode] || "";
  return [BASE_SYSTEM_PROMPT, languageBlock, modeBlock]
    .filter(Boolean)
    .join("\n\n");
}

app.post("/api/chat", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(500).json({ error: "Server not configured: missing GEMINI_API_KEY." });
    }

    // Require a valid Google login before allowing any AI request, if
    // Google login has been configured (GOOGLE_CLIENT_ID is set).
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

    const { messages, language, mode } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array is required." });
    }

    const safeLanguage = LANGUAGE_INSTRUCTIONS.hasOwnProperty(language) ? language : "auto";
    const safeMode = MODE_INSTRUCTIONS.hasOwnProperty(mode) ? mode : "general";
    const systemPrompt = buildSystemPrompt(safeLanguage, safeMode);

    // Basic safety: cap conversation length sent to the API
    const trimmedMessages = messages.slice(-30);

    // Gemini uses "user"/"model" roles (not "assistant") and a "parts" array
    // instead of plain "content" strings.
    const geminiContents = trimmedMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: geminiContents,
        generationConfig: { maxOutputTokens: 600 },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", response.status, errText);
      return res.status(502).json({ error: "Upstream AI service error." });
    }

    const data = await response.json();
    const replyText =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ||
      "Maaf karna, jawab generate nahi ho paaya.";

    res.json({ reply: replyText });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Something went wrong on the server." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`${BRAND_NAME} server running on port ${PORT}`);
});
