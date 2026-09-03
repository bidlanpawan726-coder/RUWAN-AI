require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const fs = require("fs");
const { OAuth2Client } = require("google-auth-library");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" })); // image ke liye limit badhaya
app.use(express.static("public"));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3.6-flash";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const authClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

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

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array is required." });
    }

    const safeLanguage = LANGUAGE_FILES.hasOwnProperty(language) ? language : "auto";
    const safeMode = MODE_FILES.hasOwnProperty(mode) ? mode : "general";
    const systemPrompt = buildSystemPrompt(safeLanguage, safeMode);

    const trimmedMessages = messages.slice(-30);

    const geminiContents = trimmedMessages.map(function (m) {
      return {
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      };
    });

    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":streamGenerateContent?alt=sse&key=" + GEMINI_API_KEY;

    const geminiResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: geminiContents,
        generationConfig: { maxOutputTokens: 600 },
      }),
    });

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text();
      console.error("Gemini API error:", geminiResponse.status, errText);
      return res.status(502).json({ error: "Upstream AI service error." });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    geminiResponse.body.on("data", (chunk) => {
      const lines = chunk.toString().split("\n");
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const json = JSON.parse(line.slice(6));
            const textPart = json.candidates?.[0]?.content?.parts?.[0]?.text;
            if (textPart) {
              res.write(`data: ${JSON.stringify({ text: textPart })}\n\n`);
            }
          } catch (e) {
            // ignore malformed chunk
          }
        }
      }
    });

    geminiResponse.body.on("end", () => {
      res.write("data: [DONE]\n\n");
      res.end();
    });

    geminiResponse.body.on("error", (err) => {
      console.error("Stream error:", err);
      res.end();
    });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Something went wrong on the server." });
  }
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

// Naye modes add kiye — agar in naam ki .txt files exist nahi karti,
// readPromptFile khali string return karega (koi error nahi aayega),
// bas base prompt hi use hoga jab tak aap ye files na banao.
const MODE_FILES = {
  general: null,
  professional: "mode-professional.txt",
  college: "mode-college.txt",
  research: "mode-research.txt",
  navigation: "mode-navigation.txt",
  career: "mode-career.txt",
  learning: "mode-learning.txt",
};

// Ye modes automatically Google Search grounding use karenge
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
    const image = req.body.image; // { mimeType, data } — base64, optional

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array is required." });
    }

    const safeLanguage = LANGUAGE_FILES.hasOwnProperty(language) ? language : "auto";
    const safeMode = MODE_FILES.hasOwnProperty(mode) ? mode : "general";
    const systemPrompt = buildSystemPrompt(safeLanguage, safeMode);

    const trimmedMessages = messages.slice(-30);

    const geminiContents = trimmedMessages.map(function (m) {
      return {
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      };
    });

    // Agar image bheji gayi hai, use aakhri (latest) user message ke saath jodo
    if (image && image.data && image.mimeType) {
      const lastMsg = geminiContents[geminiContents.length - 1];
      if (lastMsg && lastMsg.role === "user") {
        lastMsg.parts.push({
          inline_data: {
            mime_type: image.mimeType,
            data: image.data,
          },
        });
      }
    }

    const requestBody = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: geminiContents,
      generationConfig: { maxOutputTokens: 800 },
    };

    if (SEARCH_ENABLED_MODES[safeMode]) {
      requestBody.tools = [{ google_search: {} }];
    }

    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent?key=" + GEMINI_API_KEY;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", response.status, errText);
      return res.status(502).json({ error: "Upstream AI service error." });
    }

    const data = await response.json();
    let replyText = "Maaf karna, jawab generate nahi ho paaya.";
    if (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
      replyText = data.candidates[0].content.parts.map(function (p) { return p.text || ""; }).join("");
    }

    res.json({ reply: replyText });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Something went wrong on the server." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, function () {
  console.log(BRAND_NAME + " server running on port " + PORT);
});
