require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
const fs = require("fs");
const mongoose = require("mongoose");
const { OAuth2Client } = require("google-auth-library");

const app = express();

// ---------- MongoDB ----------
const MONGODB_URI = process.env.MONGODB_URI;

if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log("MongoDB connected successfully"))
    .catch((err) => console.error("MongoDB connection error:", err));
} else {
  console.warn("MONGODB_URI not set — database features disabled.");
}

// ---------- Database Schema ----------
const chatSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },

    title: {
      type: String,
      default: "New Chat",
    },

    messages: [
      {
        role: {
          type: String,
          required: true,
        },

        content: {
          type: String,
          required: true,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

const Chat = mongoose.model("Chat", chatSchema);

// ---------- Express ----------
const appJsonLimit = "10mb";

app.use(cors());
app.use(express.json({ limit: appJsonLimit }));
app.use(express.static("public"));

// ---------- Gemini ----------
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Existing model preserved
const MODEL = "gemini-3.6-flash";

// ---------- Google Login ----------
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

const authClient = GOOGLE_CLIENT_ID
  ? new OAuth2Client(GOOGLE_CLIENT_ID)
  : null;

// ---------- Config ----------
app.get("/api/config", (req, res) => {
  res.json({
    googleClientId: GOOGLE_CLIENT_ID || null,
  });
});

// ---------- Verify Google Token ----------
async function verifyGoogleToken(idToken) {
  if (!authClient) return null;

  try {
    const ticket = await authClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });

    return ticket.getPayload();
  } catch (err) {
    console.error("Google token verification failed:", err);
    return null;
  }
}

// ---------- Prompt Files ----------
function readPromptFile(filename) {
  try {
    return fs.readFileSync(filename, "utf8").trim();
  } catch (err) {
    return "";
  }
}

const BRAND_NAME = "Ruwan AI";

const BASE_SYSTEM_PROMPT = readPromptFile("prompt.txt");

// ---------- Languages ----------
const LANGUAGE_FILES = {
  auto: null,
  english: "lang-english.txt",
  hindi: "lang-hindi.txt",
};

// ---------- Modes ----------
const MODE_FILES = {
  general: null,
  professional: "mode-professional.txt",
  college: "mode-college.txt",
  research: "mode-research.txt",
  navigation: "mode-navigation.txt",
  career: "mode-career.txt",
  learning: "mode-learning.txt",
};

// ---------- Search Enabled Modes ----------
const SEARCH_ENABLED_MODES = {
  research: true,
  college: true,
  navigation: true,
  career: true,
  learning: true,
};

// ---------- Build System Prompt ----------
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

  parts.push(readPromptFile("youtube-suggestion.txt"));

  return parts
    .filter(Boolean)
    .join("\n\n");
}

// ============================================================
// CHAT LIST
// ============================================================

app.get("/api/chats", async (req, res) => {
  try {
    if (!authClient) {
      return res.status(500).json({
        error: "Auth not configured.",
      });
    }

    const idToken = req.query.idToken;

    if (!idToken) {
      return res.status(401).json({
        error: "Sign in required.",
      });
    }

    const payload = await verifyGoogleToken(idToken);

    if (!payload) {
      return res.status(401).json({
        error: "Session expired.",
      });
    }

    const chats = await Chat.find({
      userId: payload.sub,
    })
      .sort({ updatedAt: -1 })
      .select("title updatedAt")
      .lean();

    res.json({
      chats,
    });

  } catch (err) {
    console.error("List chats error:", err);

    res.status(500).json({
      error: "Could not load chats.",
    });
  }
});

// ============================================================
// LOAD SINGLE CHAT
// ============================================================

app.get("/api/chats/:chatId", async (req, res) => {
  try {
    if (!authClient) {
      return res.status(500).json({
        error: "Auth not configured.",
      });
    }

    const idToken = req.query.idToken;

    if (!idToken) {
      return res.status(401).json({
        error: "Sign in required.",
      });
    }

    const payload = await verifyGoogleToken(idToken);

    if (!payload) {
      return res.status(401).json({
        error: "Session expired.",
      });
    }

    const chat = await Chat.findOne({
      _id: req.params.chatId,
      userId: payload.sub,
    }).lean();

    if (!chat) {
      return res.status(404).json({
        error: "Chat not found.",
      });
    }

    res.json({
      chat,
    });

  } catch (err) {
    console.error("Get chat error:", err);

    res.status(500).json({
      error: "Could not load chat.",
    });
  }
});

// ============================================================
// MAIN CHAT ENDPOINT — STREAMING
// ============================================================

app.post("/api/chat", async (req, res) => {
  let userSub = null;

  try {
    // --------------------------------------------------------
    // Check Gemini API key
    // --------------------------------------------------------

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        error: "Server not configured: missing GEMINI_API_KEY.",
      });
    }

    // --------------------------------------------------------
    // Google Authentication
    // --------------------------------------------------------

    if (authClient) {
      const idToken = req.body.idToken;

      if (!idToken) {
        return res.status(401).json({
          error: "Please sign in with Google to chat.",
        });
      }

      const payload = await verifyGoogleToken(idToken);

      if (!payload) {
        return res.status(401).json({
          error: "Your sign-in has expired. Please sign in again.",
        });
      }

      userSub = payload.sub;
    }

    // --------------------------------------------------------
    // Request Data
    // --------------------------------------------------------

    const messages = req.body.messages;
    const language = req.body.language;
    const mode = req.body.mode;
    const image = req.body.image;
    const chatId = req.body.chatId;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: "messages array is required.",
      });
    }

    // --------------------------------------------------------
    // Safe Language / Mode
    // --------------------------------------------------------

    const safeLanguage = Object.prototype.hasOwnProperty.call(
      LANGUAGE_FILES,
      language
    )
      ? language
      : "auto";

    const safeMode = Object.prototype.hasOwnProperty.call(
      MODE_FILES,
      mode
    )
      ? mode
      : "general";

    // --------------------------------------------------------
    // System Prompt
    // --------------------------------------------------------

    const systemPrompt = buildSystemPrompt(
      safeLanguage,
      safeMode
    );

    // --------------------------------------------------------
    // Keep last 30 messages
    // --------------------------------------------------------

    const trimmedMessages = messages.slice(-30);

    // --------------------------------------------------------
    // Convert messages for Gemini
    // --------------------------------------------------------

    const geminiContents = trimmedMessages.map(function (m) {
      return {
        role: m.role === "assistant" ? "model" : "user",

        parts: [
          {
            text: String(m.content || ""),
          },
        ],
      };
    });

    // --------------------------------------------------------
    // Image support
    // --------------------------------------------------------

    if (
      image &&
      image.data &&
      image.mimeType
    ) {
      const lastMsg =
        geminiContents[geminiContents.length - 1];

      if (
        lastMsg &&
        lastMsg.role === "user"
      ) {
        lastMsg.parts.push({
          inline_data: {
            mime_type: image.mimeType,
            data: image.data,
          },
        });
      }
    }

    // --------------------------------------------------------
    // Gemini Request Body
    // --------------------------------------------------------

    const requestBody = {
      system_instruction: {
        parts: [
          {
            text: systemPrompt,
          },
        ],
      },

      contents: geminiContents,

      generationConfig: {
        maxOutputTokens: 800,
      },
    };

    // --------------------------------------------------------
    // Google Search
    // --------------------------------------------------------

    if (SEARCH_ENABLED_MODES[safeMode]) {
      requestBody.tools = [
        {
          google_search: {},
        },
      ];
    }

    // --------------------------------------------------------
    // STREAMING HEADERS
    // --------------------------------------------------------

    res.status(200);

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

    // Flush headers immediately
    if (typeof res.flushHeaders === "function") {
      res.flushHeaders();
    }

    // --------------------------------------------------------
    // Gemini Streaming URL
    // --------------------------------------------------------

    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      MODEL +
      ":streamGenerateContent?alt=sse&key=" +
      GEMINI_API_KEY;

    // --------------------------------------------------------
    // Send request to Gemini
    // --------------------------------------------------------

    const response = await fetch(url, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify(requestBody),
    });

    // --------------------------------------------------------
    // Gemini Error
    // --------------------------------------------------------

    if (!response.ok) {
      const errText = await response.text();

      console.error(
        "Gemini streaming API error:",
        response.status,
        errText
      );

      if (!res.headersSent) {
        return res.status(502).json({
          error: "Upstream AI service error.",
        });
      }

      res.write(
        `data: ${JSON.stringify({
          error: "Upstream AI service error.",
        })}\n\n`
      );

      res.write("data: [DONE]\n\n");
      return res.end();
    }

    // --------------------------------------------------------
    // Streaming variables
    // --------------------------------------------------------

    let fullReply = "";

    let streamBuffer = "";

    // --------------------------------------------------------
    // Read Gemini stream
    // --------------------------------------------------------

    response.body.on("data", (chunk) => {
      try {
        streamBuffer += chunk.toString();

        const lines = streamBuffer.split("\n");

        // Keep incomplete line for next chunk
        streamBuffer = lines.pop() || "";

        for (const line of lines) {
          const trimmedLine = line.trim();

          if (!trimmedLine) {
            continue;
          }

          if (!trimmedLine.startsWith("data:")) {
            continue;
          }

          const jsonText = trimmedLine
            .slice(5)
            .trim();

          if (!jsonText) {
            continue;
          }

          try {
            const data = JSON.parse(jsonText);

            let text = "";

            if (
              data &&
              data.candidates &&
              data.candidates[0] &&
              data.candidates[0].content &&
              data.candidates[0].content.parts
            ) {
              text =
                data.candidates[0].content.parts
                  .map(function (part) {
                    return part.text || "";
                  })
                  .join("");
            }

            if (text) {
              fullReply += text;

              // Send chunk to browser
              res.write(
                `data: ${JSON.stringify({
                  text: text,
                })}\n\n`
              );
            }

          } catch (parseError) {
            console.error(
              "Gemini chunk parse error:",
              parseError
            );
          }
        }

      } catch (streamError) {
        console.error(
          "Streaming read error:",
          streamError
        );
      }
    });

    // --------------------------------------------------------
    // Gemini stream finished
    // --------------------------------------------------------

    response.body.on("end", async () => {
      try {
        // ----------------------------------------------------
        // Save chat to MongoDB
        // ----------------------------------------------------

        let savedChatId = chatId || null;

        if (
          userSub &&
          MONGODB_URI &&
          fullReply
        ) {
          try {
            const lastUserMessage =
              trimmedMessages[
                trimmedMessages.length - 1
              ];

            if (
              lastUserMessage &&
              lastUserMessage.content
            ) {
              // Existing chat
              if (chatId) {
                const updatedChat =
                  await Chat.findOneAndUpdate(
                    {
                      _id: chatId,
                      userId: userSub,
                    },

                    {
                      $push: {
                        messages: {
                          $each: [
                            {
                              role: "user",
                              content:
                                lastUserMessage.content,
                            },

                            {
                              role: "assistant",
                              content: fullReply,
                            },
                          ],
                        },
                      },
                    },

                    {
                      new: true,
                    }
                  );

                if (updatedChat) {
                  savedChatId =
                    updatedChat._id.toString();
                }
              }

              // New chat
              else {
                const title =
                  String(
                    lastUserMessage.content
                  )
                    .slice(0, 40)
                    .trim() || "New Chat";

                const newChat =
                  await Chat.create({
                    userId: userSub,

                    title: title,

                    messages: [
                      {
                        role: "user",
                        content:
                          lastUserMessage.content,
                      },

                      {
                        role: "assistant",
                        content: fullReply,
                      },
                    ],
                  });

                savedChatId =
                  newChat._id.toString();
              }
            }

          } catch (dbErr) {
            console.error(
              "Chat save error:",
              dbErr
            );
          }
        }

        // ----------------------------------------------------
        // Send final chat ID
        // ----------------------------------------------------

        res.write(
          `data: ${JSON.stringify({
            chatId: savedChatId,
          })}\n\n`
        );

        // Tell frontend stream is complete
        res.write("data: [DONE]\n\n");

        res.end();

      } catch (endError) {
        console.error(
          "Stream end error:",
          endError
        );

        if (!res.writableEnded) {
          res.write(
            `data: ${JSON.stringify({
              error: "Response completed with an error.",
            })}\n\n`
          );

          res.write("data: [DONE]\n\n");
          res.end();
        }
      }
    });

    // --------------------------------------------------------
    // Gemini stream error
    // --------------------------------------------------------

    response.body.on("error", (streamError) => {
      console.error(
        "Gemini response stream error:",
        streamError
      );

      if (!res.writableEnded) {
        res.write(
          `data: ${JSON.stringify({
            error: "AI streaming connection failed.",
          })}\n\n`
        );

        res.write("data: [DONE]\n\n");
        res.end();
      }
    });

    // --------------------------------------------------------
    // Client disconnected
    // --------------------------------------------------------

    req.on("close", () => {
      if (!res.writableEnded) {
        console.log(
          "Client disconnected from chat stream."
        );

        // Abort Gemini request if possible
        if (
          response.body &&
          typeof response.body.destroy === "function"
        ) {
          response.body.destroy();
        }
      }
    });

  } catch (err) {
    console.error(
      "Server error:",
      err
    );

    if (!res.headersSent) {
      return res.status(500).json({
        error: "Something went wrong on the server.",
      });
    }

    if (!res.writableEnded) {
      res.write(
        `data: ${JSON.stringify({
          error: "Something went wrong on the server.",
        })}\n\n`
      );

      res.write("data: [DONE]\n\n");
      res.end();
    }
  }
});

// ============================================================
// SERVER
// ============================================================

const PORT =
  process.env.PORT || 3000;

app.listen(PORT, function () {
  console.log(
    BRAND_NAME +
      " server running on port " +
      PORT
  );
});
