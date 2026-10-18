const chat = document.getElementById("chat");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic");
const newBtn = document.getElementById("newchat");
const modeSel = document.getElementById("mode");
const photoBtn = document.getElementById("photo");
const fileInput = document.getElementById("file");

const WORKER_URL = "https://kurama-ai-backend.harshithuppu329.workers.dev";
const LANG = "en-IN"; // speech language
const STORE_KEY = "kurama_history_v1";
const FACTS_KEY = "kurama_facts_v1";
const MODE_KEY = "kurama_mode_v1";
const MAX_FACTS = 30;

// ---- Saved on this phone's browser only ----
function loadList(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}
function saveHistory() {
  try {
    history = history.slice(-40);
    localStorage.setItem(STORE_KEY, JSON.stringify(history));
  } catch (e) {}
}
function saveFacts() {
  try {
    localStorage.setItem(FACTS_KEY, JSON.stringify(facts));
  } catch (e) {}
}

let history = loadList(STORE_KEY); // this chat
let facts = loadList(FACTS_KEY); // long-term notes
let pendingImage = null; // photo waiting to be sent

// ---- Mode ----
try {
  modeSel.value = localStorage.getItem(MODE_KEY) || "chat";
} catch (e) {}
if (!modeSel.value) modeSel.value = "chat";
modeSel.addEventListener("change", () => {
  try {
    localStorage.setItem(MODE_KEY, modeSel.value);
  } catch (e) {}
});

function addMessage(text, who) {
  const div = document.createElement("div");
  div.className = "msg " + who;
  div.textContent = text;
  div.style.whiteSpace = "pre-line";
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

function addImageMessage(src) {
  const div = document.createElement("div");
  div.className = "msg user";
  const img = document.createElement("img");
  img.src = src;
  img.alt = "Your photo";
  div.appendChild(img);
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

// Show the saved chat when the page opens
history.forEach((m) =>
  addMessage(m.text, m.role === "user" ? "user" : "kurama")
);

// ---- Memory commands, handled on the phone ----
function handleMemoryCommand(text) {
  const t = text.trim().replace(/[.!]+$/, "");

  let m = t.match(/^remember(?:\s+that)?\s+(.+)/i);
  if (m) {
    const note = m[1].trim();
    if (facts.length >= MAX_FACTS) {
      return "My memory is full (" + MAX_FACTS + " notes). Say 'forget 1' to free space.";
    }
    facts.push(note.slice(0, 200));
    saveFacts();
    return "Saved. I'll remember: " + note;
  }

  if (/^(what do you remember|show (my )?memory|my memory)/i.test(t)) {
    if (!facts.length) {
      return "I don't have any notes yet. Say 'remember that ...' to add one.";
    }
    return (
      "Here's what I remember:\n" +
      facts.map((f, i) => i + 1 + ". " + f).join("\n")
    );
  }

  if (/^forget\s+(everything|all)$/i.test(t)) {
    facts = [];
    saveFacts();
    return "Done. I forgot all my notes.";
  }

  m = t.match(/^forget\s+(\d+)$/i);
  if (m) {
    const i = parseInt(m[1], 10) - 1;
    if (i < 0 || i >= facts.length) {
      return "I don't have a note with that number. Say 'what do you remember' to see the list.";
    }
    const gone = facts.splice(i, 1)[0];
    saveFacts();
    return "Forgot: " + gone;
  }

  return null;
}

// ---- Photos: shrink to a small JPEG before sending ----
function fileToJpeg(file, maxSide) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      const dataUrl = c.toDataURL("image/jpeg", 0.8);
      URL.revokeObjectURL(url);
      resolve({ mime: "image/jpeg", data: dataUrl.split(",")[1], preview: dataUrl });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image"));
    };
    img.src = url;
  });
}

photoBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const file = fileInput.files && fileInput.files[0];
  fileInput.value = "";
  if (!file) return;
  try {
    pendingImage = await fileToJpeg(file, 1024);
    addImageMessage(pendingImage.preview);
    addMessage("Photo ready. Ask a question about it, or just tap send.", "kurama");
    input.placeholder = "Ask about the photo...";
    input.focus();
  } catch (e) {
    pendingImage = null;
    addMessage("Photo problem: " + e.message, "kurama");
  }
});

// ---- Kurama speaks (code blocks are skipped) ----
function speak(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const clean = text
    .replace(/```[\s\S]*?```/g, " I put the code on your screen. ")
    .replace(/[*_`#]/g, "");
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = LANG;
  u.rate = 1;
  u.pitch = 0.8;
  window.speechSynthesis.speak(u);
}

async function sendMessage(fromVoice) {
  let text = input.value.trim();
  if (!text && !pendingImage) return;

  const image = pendingImage;
  if (!text) text = "Please look at this photo and explain it to me.";

  addMessage(text, "user");
  input.value = "";

  // Memory commands never go to the AI
  const local = image ? null : handleMemoryCommand(text);
  if (local) {
    addMessage(local, "kurama");
    if (fromVoice) speak(local);
    return;
  }

  pendingImage = null;
  input.placeholder = "Talk to Kurama...";
  sendBtn.disabled = true;
  const thinking = addMessage(
    image ? "Kurama is looking at your photo..." : "Kurama is thinking...",
    "kurama"
  );

  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        history,
        facts,
        mode: modeSel.value,
        image: image ? { mime: image.mime, data: image.data } : undefined,
      }),
    });
    const data = await res.json();
    thinking.textContent =
      data.reply || "Error: " + (data.error || res.status);

    if (data.reply) {
      history.push({
        role: "user",
        text: image ? "[Sent a photo] " + text : text,
      });
      history.push({ role: "model", text: data.reply });
      saveHistory();
      if (fromVoice) speak(data.reply);
    }
  } catch (e) {
    thinking.textContent = "Connection problem: " + e.message;
  }

  sendBtn.disabled = false;
  chat.scrollTop = chat.scrollHeight;
}

sendBtn.addEventListener("click", () => sendMessage(false));
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage(false);
});

// New chat clears this conversation but keeps long-term notes
newBtn.addEventListener("click", () => {
  if (!confirm("Start a new chat? Your saved notes will be kept.")) return;
  history = [];
  pendingImage = null;
  saveHistory();
  chat.innerHTML = "";
  input.placeholder = "Talk to Kurama...";
  window.speechSynthesis.cancel();
  addMessage("New chat started. What are we doing today?", "kurama");
});

// ---- You speak ----
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;

if (SR) {
  recognition = new SR();
  recognition.lang = LANG;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    listening = true;
    micBtn.classList.add("listening");
    input.placeholder = "Listening...";
  };
  recognition.onend = () => {
    listening = false;
    micBtn.classList.remove("listening");
    input.placeholder = pendingImage
      ? "Ask about the photo..."
      : "Talk to Kurama...";
  };
  recognition.onresult = (e) => {
    input.value = e.results[0][0].transcript;
    sendMessage(true);
  };
  recognition.onerror = (e) => {
    addMessage("Mic problem: " + e.error, "kurama");
  };
}

micBtn.addEventListener("click", () => {
  if (!recognition) {
    addMessage("Voice isn't supported in this browser. Try Chrome.", "kurama");
    return;
  }
  if (listening) {
    recognition.stop();
  } else {
    window.speechSynthesis.cancel();
    recognition.start();
  }
});
