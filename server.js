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

// ---------- Database Schemas ----------
const chatSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  title: { type: String, default: "New Chat" },
  messages: [
    {
      role: { type: String, required: true },
      content: { type: String, required: true },
    },
  ],
}, { timestamps: true });

const Chat = mongoose.model("Chat", chatSchema);

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

  if (langFile) {
    parts.push(readPromptFile(langFile));
  }

  const modeFile = MODE_FILES[mode];

  if (modeFile) {
    parts.push(readPromptFile(modeFile));
  }

  parts.push(
    readPromptFile("youtube-suggestion.txt")
  );

  return parts
    .filter(Boolean)
    .join("\n\n");
}

// ---------- Chat List (Sidebar Ke Liye — Baad Mein Use Hoga) ----------
app.get("/api/chats", async (req, res) => {
  try {
    if (!authClient) {
      return res.status(500).json({
        error: "Auth not configured."
      });
    }

    const idToken = req.query.idToken;

    if (!idToken) {
      return res.status(401).json({
        error: "Sign in required."
      });
    }

    const payload =
      await verifyGoogleToken(idToken);

    if (!payload) {
      return res.status(401).json({
        error: "Session expired."
      });
    }

    const chats = await Chat.find({
      userId: payload.sub
    })
      .sort({ updatedAt: -1 })
      .select("title updatedAt")
      .lean();

    res.json({ chats });

  } catch (err) {

    console.error(
      "List chats error:",
      err
    );

    res.status(500).json({
      error: "Could not load chats."
    });

  }
});

// ---------- Single Chat Load Karna ----------
app.get("/api/chats/:chatId", async (req, res) => {
  try {
    if (!authClient) {
      return res.status(500).json({
        error: "Auth not configured."
      });
    }

    const idToken = req.query.idToken;

    if (!idToken) {
      return res.status(401).json({
        error: "Sign in required."
      });
    }

    const payload =
      await verifyGoogleToken(idToken);

    if (!payload) {
      return res.status(401).json({
        error: "Session expired."
      });
    }

    const chat = await Chat.findOne({
      _id: req.params.chatId,
      userId: payload.sub
    }).lean();

    if (!chat) {
      return res.status(404).json({
        error: "Chat not found."
      });
    }

    res.json({ chat });

  } catch (err) {

    console.error(
      "Get chat error:",
      err
    );

    res.status(500).json({
      error: "Could not load chat."
    });

  }
});

// ==========================================================
// Main Chat Endpoint
// ONLY CHANGE: Gemini response is now STREAMING
// ==========================================================
app.post("/api/chat", async (req, res) => {

  try {

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error:
          "Server not configured: missing GEMINI_API_KEY."
      });
    }

    let userSub = null;

    // ---------- Google Authentication ----------
    if (authClient) {

      const idToken =
        req.body.idToken;

      if (!idToken) {
        return res.status(401).json({
          error:
            "Please sign in with Google to chat."
        });
      }

      const payload =
        await verifyGoogleToken(idToken);

      if (!payload) {
        return res.status(401).json({
          error:
            "Your sign-in has expired. Please sign in again."
        });
      }

      userSub = payload.sub;
    }

    const messages =
      req.body.messages;

    const language =
      req.body.language;

    const mode =
      req.body.mode;

    const image =
      req.body.image;

    const chatId =
      req.body.chatId;

    if (
      !Array.isArray(messages) ||
      messages.length === 0
    ) {
      return res.status(400).json({
        error:
          "messages array is required."
      });
    }

    const safeLanguage =
      LANGUAGE_FILES.hasOwnProperty(language)
        ? language
        : "auto";

    const safeMode =
      MODE_FILES.hasOwnProperty(mode)
        ? mode
        : "general";

    const systemPrompt =
      buildSystemPrompt(
        safeLanguage,
        safeMode
      );

    // Same 30-message limit
    const trimmedMessages =
      messages.slice(-30);

    const geminiContents =
      trimmedMessages.map(function (m) {

        return {
          role:
            m.role === "assistant"
              ? "model"
              : "user",

          parts: [
            {
              text: m.content
            }
          ],
        };

      });

    // ---------- Image Handling ----------
    if (
      image &&
      image.data &&
      image.mimeType
    ) {

      const lastMsg =
        geminiContents[
          geminiContents.length - 1
        ];

      if (
        lastMsg &&
        lastMsg.role === "user"
      ) {

        lastMsg.parts.push({
          inline_data: {
            mime_type:
              image.mimeType,

            data:
              image.data,
          },
        });

      }

    }

    // ---------- Same Request Body ----------
    const requestBody = {

      system_instruction: {
        parts: [
          {
            text:
              systemPrompt
          }
        ]
      },

      contents:
        geminiContents,

      generationConfig: {
        maxOutputTokens: 800
      },

    };

    // ---------- SAME SEARCH SETTINGS ----------
    if (
      SEARCH_ENABLED_MODES[
        safeMode
      ]
    ) {

      requestBody.tools = [
        {
          google_search: {}
        }
      ];

    }

    // ======================================================
    // STREAMING GEMINI ENDPOINT
    // ======================================================
    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      MODEL +
      ":streamGenerateContent?alt=sse&key=" +
      GEMINI_API_KEY;

    const response =
      await fetch(
        url,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body:
            JSON.stringify(
              requestBody
            ),
        }
      );

    // ---------- Gemini Error ----------
    if (!response.ok) {

      const errText =
        await response.text();

      console.error(
        "Gemini API error:",
        response.status,
        errText
      );

      return res.status(502).json({
        error:
          "Upstream AI service error."
      });

    }

    // ======================================================
    // SSE HEADERS
    // ======================================================
    res.setHeader(
      "Content-Type",
      "text/event-stream; charset=utf-8"
    );

    res.setHeader(
      "Cache-Control",
      "no-cache, no-transform"
    );

    res.setHeader(
      "Connection",
      "keep-alive"
    );

    res.setHeader(
      "X-Accel-Buffering",
      "no"
    );

    if (res.flushHeaders) {
      res.flushHeaders();
    }

    // ======================================================
    // READ GEMINI STREAM
    // ======================================================
    let buffer = "";
    let replyText = "";

    for await (
      const chunk of response.body
    ) {

      buffer +=
        chunk.toString("utf8");

      const events =
        buffer.split(
          /\r?\n\r?\n/
        );

      buffer =
        events.pop() || "";

      for (
        const event
        of events
      ) {

        const lines =
          event.split(/\r?\n/);

        for (
          const line
          of lines
        ) {

          if (
            !line.startsWith(
              "data:"
            )
          ) {
            continue;
          }

          const payload =
            line
              .slice(5)
              .trim();

          if (!payload) {
            continue;
          }

          try {

            const parsed =
              JSON.parse(
                payload
              );

            const parts =
              parsed &&
              parsed.candidates &&
              parsed.candidates[0] &&
              parsed.candidates[0].content &&
              parsed.candidates[0].content.parts
                ? parsed.candidates[0].content.parts
                : [];

            const text =
              parts
                .map(function (p) {
                  return p.text || "";
                })
                .join("");

            if (text) {

              replyText +=
                text;

              // Send small chunk to frontend
              res.write(
                "data: " +
                JSON.stringify({
                  text: text
                }) +
                "\n\n"
              );

            }

          } catch (parseErr) {

            console.warn(
              "Gemini stream parse error:",
              payload
            );

          }

        }

      }

    }

    // ======================================================
    // DATABASE SAVE
    // Same logic as before
    // ======================================================
    let savedChatId =
      chatId || null;

    if (
      userSub &&
      MONGODB_URI
    ) {

      try {

        const lastUserMessage =
          trimmedMessages[
            trimmedMessages.length - 1
          ];

        if (chatId) {

          await Chat.findOneAndUpdate(
            {
              _id: chatId,
              userId: userSub
            },

            {
              $push: {
                messages: {
                  $each: [

                    {
                      role:
                        "user",

                      content:
                        lastUserMessage.content
                    },

                    {
                      role:
                        "assistant",

                      content:
                        replyText
                    }

                  ]
                }
              }
            }
          );

        } else {

          const title =
            lastUserMessage.content
              .slice(0, 40) ||
            "New Chat";

          const newChat =
            await Chat.create({

              userId:
                userSub,

              title:
                title,

              messages: [

                {
                  role:
                    "user",

                  content:
                    lastUserMessage.content
                },

                {
                  role:
                    "assistant",

                  content:
                    replyText
                }

              ]

            });

          savedChatId =
            newChat._id.toString();

        }

      } catch (dbErr) {

        console.error(
          "Chat save error:",
          dbErr
        );

        // Save fail ho to bhi answer user ko milega

      }

    }

    // ======================================================
    // SEND CHAT ID
    // ======================================================
    if (savedChatId) {

      res.write(
        "data: " +
        JSON.stringify({
          chatId:
            savedChatId
        }) +
        "\n\n"
      );

    }

    // ======================================================
    // STREAM COMPLETE
    // ======================================================
    res.write(
      "data: [DONE]\n\n"
    );

    res.end();

  } catch (err) {

    console.error(
      "Server error:",
      err
    );

    if (!res.headersSent) {

      return res.status(500).json({
        error:
          "Something went wrong on the server."
      });

    }

    // If streaming already started
    res.write(
      "data: " +
      JSON.stringify({
        error:
          "Something went wrong on the server."
      }) +
      "\n\n"
    );

    res.end();

  }

});

const PORT =
  process.env.PORT || 3000;

app.listen(
  PORT,
  function () {

    console.log(
      BRAND_NAME +
      " server running on port " +
      PORT
    );

  }
);
