let idToken = null;

function handleCredentialResponse(response) {
  idToken = response.credential;
  document.getElementById("loginScreen").style.display = "none";
  document.getElementById("appShell").style.display = "";
  const payload = JSON.parse(atob(idToken.split(".")[1]));
  document.getElementById("userEmail").textContent = payload.email || "";
}

document.getElementById("signOutBtn").addEventListener("click", () => {
  idToken = null;
  document.getElementById("appShell").style.display = "none";
  document.getElementById("loginScreen").style.display = "";
  google.accounts.id.disableAutoSelect();
});

const chatArea = document.getElementById("chatArea");
const form = document.getElementById("composerForm");
const input = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const languageSelect = document.getElementById("languageSelect");
const modeSelect = document.getElementById("modeSelect");
// Full running history sent to the backend on every request.
// (The backend/API has no memory between calls, so we resend context each time.)
let history = [];
function addMessage(role, text) {
  const wrapper = document.createElement("div");
  wrapper.className = `msg msg--${role === "user" ? "user" : "ai"}`;
  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.textContent = text;
  wrapper.appendChild(bubble);
  chatArea.appendChild(wrapper);
  chatArea.scrollTop = chatArea.scrollHeight;
  return wrapper;
}
function addTypingIndicator() {
  const wrapper = document.createElement("div");
  wrapper.className = "msg msg--ai msg--typing";
  wrapper.innerHTML = `
    <div class="msg-bubble">
      <span class="dot"></span><span class="dot"></span><span class="dot"></span>
    </div>`;
  chatArea.appendChild(wrapper);
  chatArea.scrollTop = chatArea.scrollHeight;
  return wrapper;
}
async function sendMessage(text) {
  history.push({ role: "user", content: text });
  addMessage("user", text);
  input.value = "";
  autoResize();
  sendBtn.disabled = true;
  const typingEl = addTypingIndicator();
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: history,
        language: languageSelect.value,
        mode: modeSelect.value,
        idToken: idToken,
      }),
    });
    const data = await res.json();
    typingEl.remove();
    if (!res.ok) {
      addMessage("ai", data.error || "Kuch gadbad ho gayi. Thodi der baad try karein.");
      return;
    }
    history.push({ role: "assistant", content: data.reply });
    addMessage("ai", data.reply);
  } catch (err) {
    typingEl.remove();
    addMessage("ai", "Connection mein dikkat aa rahi hai. Apna internet check karke phir try karein.");
  } finally {
    sendBtn.disabled = false;
  }
}
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  sendMessage(text);
});
// Enter to send, Shift+Enter for new line
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});
function autoResize() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 140) + "px";
}
input.addEventListener("input", autoResize);
