let idToken = null;
let currentChatId = null;

const chatArea = document.getElementById("chatArea");
const form = document.getElementById("composerForm");
const input = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const languageSelect = document.getElementById("languageSelect");
const modeSelect = document.getElementById("modeSelect");

// Chat history sent to backend
let history = [];

// --------------------------------------------------
// GOOGLE LOGIN
// --------------------------------------------------

function handleCredentialResponse(response) {
  idToken = response.credential;

  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("appShell").style.display = "";

  try {
    const payload = JSON.parse(
      atob(idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))
    );

    const emailEl = document.getElementById("userEmail");
    if (emailEl) {
      emailEl.textContent = payload.email || "";
    }
  } catch (err) {
    console.error("Google profile decode error:", err);
  }

  // Login ke baad chat history load
  loadChatHistory();
}

const signOutBtn = document.getElementById("signOutBtn");

if (signOutBtn) {
  signOutBtn.addEventListener("click", () => {
    idToken = null;
    currentChatId = null;
    history = [];

    document.getElementById("appShell").style.display = "none";
    document.getElementById("loginScreen").style.display = "";

    if (window.google && google.accounts && google.accounts.id) {
      google.accounts.id.disableAutoSelect();
    }

    clearChatScreen();
  });
}

// --------------------------------------------------
// SIDEBAR HISTORY ELEMENT
// --------------------------------------------------

function getHistoryContainer() {
  // Aapke HTML mein inmein se jo bhi ID hai use kar lega
  return (
    document.getElementById("chatHistory") ||
    document.getElementById("historyList") ||
    document.getElementById("chatList") ||
    document.querySelector(".chat-history") ||
    document.querySelector(".history-list") ||
    document.querySelector(".chat-list")
  );
}

// --------------------------------------------------
// LOAD ALL CHAT HISTORY
// --------------------------------------------------

async function loadChatHistory() {
  const container = getHistoryContainer();

  if (!container) {
    console.warn("Chat history container nahi mila.");
    return;
  }

  container.innerHTML = `
    <div class="history-loading">Loading...</div>
  `;

  if (!idToken) {
    container.innerHTML = `
      <div class="history-empty">Please sign in.</div>
    `;
    return;
  }

  try {
    const url =
      "/api/chats?idToken=" + encodeURIComponent(idToken);

    const res = await fetch(url, {
      method: "GET",
      cache: "no-store"
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Could not load chats.");
    }

    const chats = Array.isArray(data.chats) ? data.chats : [];

    if (chats.length === 0) {
      container.innerHTML = `
        <div class="history-empty">
          No chats yet
        </div>
      `;
      return;
    }

    container.innerHTML = "";

    chats.forEach((chat) => {
      const item = document.createElement("button");

      item.type = "button";
      item.className = "history-item";

      if (String(chat._id) === String(currentChatId)) {
        item.classList.add("active");
      }

      item.dataset.chatId = chat._id;

      item.innerHTML = `
        <span class="history-item-title">
          ${escapeHtml(chat.title || "New Chat")}
        </span>
      `;

      item.addEventListener("click", () => {
        loadChat(chat._id);
      });

      container.appendChild(item);
    });

  } catch (err) {
    console.error("Chat history error:", err);

    container.innerHTML = `
      <div class="history-error">
        History load nahi ho rahi.
        <button type="button" class="history-retry">
          Retry
        </button>
      </div>
    `;

    const retryBtn = container.querySelector(".history-retry");

    if (retryBtn) {
      retryBtn.addEventListener("click", loadChatHistory);
    }
  }
}

// --------------------------------------------------
// LOAD ONE OLD CHAT
// --------------------------------------------------

async function loadChat(chatId) {
  if (!idToken || !chatId) return;

  try {
    sendBtn.disabled = true;

    const url =
      "/api/chats/" +
      encodeURIComponent(chatId) +
      "?idToken=" +
      encodeURIComponent(idToken);

    const res = await fetch(url, {
      method: "GET",
      cache: "no-store"
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Could not load chat.");
    }

    if (!data.chat) {
      throw new Error("Chat not found.");
    }

    currentChatId = data.chat._id;

    history = Array.isArray(data.chat.messages)
      ? data.chat.messages.map((message) => ({
          role: message.role,
          content: message.content
        }))
      : [];

    clearChatScreen();

    history.forEach((message) => {
      if (message.role === "user") {
        addMessage("user", message.content);
      } else {
        addMessage("assistant", message.content);
      }
    });

    highlightCurrentChat();

    // Mobile par sidebar close karne ki koshish
    closeSidebarOnMobile();

  } catch (err) {
    console.error("Load chat error:", err);
    alert("Chat load nahi ho paayi. Please try again.");
  } finally {
    sendBtn.disabled = false;
  }
}

// --------------------------------------------------
// NEW CHAT
// --------------------------------------------------

function startNewChat() {
  currentChatId = null;
  history = [];

  clearChatScreen();
  highlightCurrentChat();
  closeSidebarOnMobile();

  input.value = "";
  autoResize();
  input.focus();
}

// Existing HTML mein New Chat button ho to automatically connect
const newChatBtn =
  document.getElementById("newChatBtn") ||
  document.querySelector("[data-new-chat]") ||
  document.querySelector(".new-chat-btn");

if (newChatBtn) {
  newChatBtn.addEventListener("click", startNewChat);
}

// --------------------------------------------------
// SEND MESSAGE + STREAMING
// --------------------------------------------------

async function sendMessage(text) {
  if (!idToken) {
    addMessage("ai", "Please pehle Google se sign in karein.");
    return;
  }

  history.push({
    role: "user",
    content: text
  });

  addMessage("user", text);

  input.value = "";
  autoResize();

  sendBtn.disabled = true;

  const typingEl = addTypingIndicator();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages: history,
        language: languageSelect.value,
        mode: modeSelect.value,
        idToken: idToken,

        // IMPORTANT:
        // Existing chat continue karne ke liye
        chatId: currentChatId
      })
    });

    // Authentication / normal JSON errors
    if (!res.ok) {
      typingEl.remove();

      let data = {};

      try {
        data = await res.json();
      } catch (e) {}

      addMessage(
        "ai",
        data.error ||
          "Kuch gadbad ho gayi. Thodi der baad try karein."
      );

      // Token expire hua ho to history bhi clear
      if (res.status === 401) {
        currentChatId = null;
      }

      sendBtn.disabled = false;
      return;
    }

    typingEl.remove();

    const aiWrapper = addMessage("ai", "");
    const bubble = aiWrapper.querySelector(".msg-bubble");

    let fullText = "";

    if (!res.body) {
      throw new Error("Streaming response unavailable.");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, {
        stream: true
      });

      const lines = buffer.split("\n");

      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) {
          continue;
        }

        const payload = line.slice(6).trim();

        if (!payload) continue;

        if (payload === "[DONE]") {
          continue;
        }

        try {
          const parsed = JSON.parse(payload);

          // AI text chunk
          if (parsed.text) {
            fullText += parsed.text;

            bubble.textContent = fullText;

            chatArea.scrollTop =
              chatArea.scrollHeight;
          }

          // Backend se saved chat ID
          if (parsed.chatId) {
            currentChatId = parsed.chatId;
          }

          // Backend SSE error
          if (parsed.error) {
            console.error(
              "Streaming error:",
              parsed.error
            );
          }

        } catch (err) {
          console.warn(
            "SSE chunk parse error:",
            payload
          );
        }
      }
    }

    // Final incomplete SSE buffer process karo
    if (buffer.startsWith("data: ")) {
      const payload = buffer.slice(6).trim();

      if (payload && payload !== "[DONE]") {
        try {
          const parsed = JSON.parse(payload);

          if (parsed.text) {
            fullText += parsed.text;
            bubble.textContent = fullText;
          }

          if (parsed.chatId) {
            currentChatId = parsed.chatId;
          }
        } catch (e) {}
      }
    }

    // AI response history mein save
    history.push({
      role: "assistant",
      content: fullText
    });

    // Sidebar ko latest chats se refresh karo
    await loadChatHistory();

    highlightCurrentChat();

  } catch (err) {
    console.error("Send message error:", err);

    typingEl.remove();

    addMessage(
      "ai",
      "Connection mein dikkat aa rahi hai. Apna internet check karke phir try karein."
    );

  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

// --------------------------------------------------
// FORM SUBMIT
// --------------------------------------------------

form.addEventListener("submit", (e) => {
  e.preventDefault();

  const text = input.value.trim();

  if (!text) return;

  sendMessage(text);
});

// --------------------------------------------------
// ENTER TO SEND
// SHIFT + ENTER = NEW LINE
// --------------------------------------------------

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

// --------------------------------------------------
// ADD MESSAGE
// --------------------------------------------------

function addMessage(role, text) {
  const wrapper = document.createElement("div");

  wrapper.className =
    `msg msg--${role === "user" ? "user" : "ai"}`;

  const bubble = document.createElement("div");

  bubble.className = "msg-bubble";
  bubble.textContent = text;

  wrapper.appendChild(bubble);
  chatArea.appendChild(wrapper);

  chatArea.scrollTop = chatArea.scrollHeight;

  return wrapper;
}

// --------------------------------------------------
// TYPING INDICATOR
// --------------------------------------------------

function addTypingIndicator() {
  const wrapper = document.createElement("div");

  wrapper.className =
    "msg msg--ai msg--typing";

  wrapper.innerHTML = `
    <div class="msg-bubble">
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    </div>
  `;

  chatArea.appendChild(wrapper);

  chatArea.scrollTop = chatArea.scrollHeight;

  return wrapper;
}

// --------------------------------------------------
// CLEAR CURRENT CHAT SCREEN
// --------------------------------------------------

function clearChatScreen() {
  if (chatArea) {
    chatArea.innerHTML = "";
  }
}

// --------------------------------------------------
// HIGHLIGHT CURRENT CHAT
// --------------------------------------------------

function highlightCurrentChat() {
  const container = getHistoryContainer();

  if (!container) return;

  const items =
    container.querySelectorAll(".history-item");

  items.forEach((item) => {
    if (
      String(item.dataset.chatId) ===
      String(currentChatId)
    ) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });
}

// --------------------------------------------------
// MOBILE SIDEBAR
// --------------------------------------------------

function closeSidebarOnMobile() {
  if (window.innerWidth > 768) return;

  const sidebar =
    document.querySelector(".sidebar") ||
    document.getElementById("sidebar");

  if (!sidebar) return;

  sidebar.classList.remove("open");
  sidebar.classList.remove("active");
}

// --------------------------------------------------
// HTML ESCAPE
// --------------------------------------------------

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

// --------------------------------------------------
// AUTO RESIZE INPUT
// --------------------------------------------------

function autoResize() {
  input.style.height = "auto";

  input.style.height =
    Math.min(input.scrollHeight, 140) + "px";
}

input.addEventListener("input", autoResize);

// --------------------------------------------------
// INITIAL LOAD
// --------------------------------------------------

// Agar page reload ho aur Google login already available ho,
// to history login callback ke baad load hogi.

if (idToken) {
  loadChatHistory();
}
