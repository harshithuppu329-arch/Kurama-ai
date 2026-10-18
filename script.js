const chat = document.getElementById("chat");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic");

const WORKER_URL = "https://kurama-ai-backend.harshithuppu329.workers.dev";
const LANG = "en-IN"; // speech language
let history = []; // the current conversation, so Kurama remembers it

function addMessage(text, who) {
  const div = document.createElement("div");
  div.className = "msg " + who;
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

// Kurama speaks
function speak(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const clean = text.replace(/[*_`#]/g, "");
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = LANG;
  u.rate = 1;
  u.pitch = 0.8;
  window.speechSynthesis.speak(u);
}

async function sendMessage(fromVoice) {
  const text = input.value.trim();
  if (!text) return;

  addMessage(text, "user");
  input.value = "";
  sendBtn.disabled = true;

  const thinking = addMessage("Kurama is thinking...", "kurama");

  try {
    const res = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history }),
    });
    const data = await res.json();
    thinking.textContent =
      data.reply || "Error: " + (data.error || res.status);

    if (data.reply) {
      // Remember this exchange
      history.push({ role: "user", text });
      history.push({ role: "model", text: data.reply });
      // Spoken question gets a spoken answer
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

// You speak
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
    input.placeholder = "Talk to Kurama...";
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
