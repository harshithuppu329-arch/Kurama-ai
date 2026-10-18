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
const CONTACTS_KEY = "kurama_contacts_v1";
const MAX_FACTS = 30;
const MAX_CONTACTS = 50;

// ---- Saved on this phone's browser only ----
function loadList(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}
function loadObject(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch (e) {
    return {};
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
function saveContacts() {
  try {
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
  } catch (e) {}
}

let history = loadList(STORE_KEY); // this chat
let facts = loadList(FACTS_KEY); // long-term notes
let contacts = loadObject(CONTACTS_KEY); // name -> {n, p}
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

// A Kurama message with a button you tap to confirm the action
function addActionMessage(text, label, href, external) {
  const div = addMessage(text, "kurama");
  div.appendChild(document.createElement("br"));
  const a = document.createElement("a");
  a.href = href;
  a.textContent = label;
  a.className = "action";
  if (external) {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  }
  div.appendChild(a);
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

// ---- Phone actions, handled on the phone (you tap to confirm) ----
const SITES = {
  youtube: "https://www.youtube.com",
  google: "https://www.google.com",
  gmail: "https://mail.google.com",
  maps: "https://maps.google.com",
  whatsapp: "https://wa.me/",
  instagram: "https://www.instagram.com",
  spotify: "https://open.spotify.com",
  github: "https://github.com",
  facebook: "https://www.facebook.com",
};

const PHONE_HELP =
  "Phone actions (you tap the button to confirm):\n" +
  "• open youtube / open gmail / open github.com\n" +
  "• search black holes\n" +
  "• search youtube for anime openings\n" +
  "• navigate to Charminar\n" +
  "• call 9876543210 or call Mom\n" +
  "• text Mom I'm on my way\n" +
  "• save contact Mom 9876543210\n" +
  "• contacts / delete contact Mom";

function getContact(name) {
  const k = name.toLowerCase();
  return Object.prototype.hasOwnProperty.call(contacts, k) ? contacts[k] : null;
}

function cleanNumber(s) {
  return s.replace(/[\s-]/g, "");
}

function isNumber(s) {
  return /^\+?\d{6,15}$/.test(cleanNumber(s));
}

// Returns {text, label?, href?, external?} or null (not a phone action)
function handlePhoneAction(text) {
  const t = text.trim().replace(/[.!?]+$/, "");
  const NOT_NAMES = ["me", "us", "you", "him", "her", "them", "a", "an", "the", "about"];
  let m;

  if (/^(phone help|phone actions|what can you do on my phone)$/i.test(t)) {
    return { text: PHONE_HELP };
  }

  // contacts
  m = t.match(/^save contact\s+(\S+)\s+(\+?[\d\s-]{6,})$/i);
  if (m) {
    const key = m[1].toLowerCase();
    if (!getContact(key) && Object.keys(contacts).length >= MAX_CONTACTS) {
      return { text: "Contact list is full (" + MAX_CONTACTS + "). Delete one first." };
    }
    contacts[key] = { n: m[1], p: cleanNumber(m[2]) };
    saveContacts();
    return { text: "Saved contact " + m[1] + ": " + cleanNumber(m[2]) };
  }
  if (/^(show )?contacts$/i.test(t)) {
    const list = Object.values(contacts);
    if (!list.length) {
      return { text: "No contacts yet. Say 'save contact Mom 9876543210'." };
    }
    return { text: "Your contacts:\n" + list.map((c) => c.n + ": " + c.p).join("\n") };
  }
  m = t.match(/^delete contact\s+(\S+)$/i);
  if (m) {
    const key = m[1].toLowerCase();
    if (!getContact(key)) return { text: "I don't have a contact called " + m[1] + "." };
    delete contacts[key];
    saveContacts();
    return { text: "Deleted contact " + m[1] + "." };
  }

  // call
  m = t.match(/^(?:call|dial|phone)\s+(.+)$/i);
  if (m) {
    const rest = m[1].trim();
    if (isNumber(rest)) {
      const num = cleanNumber(rest);
      return { text: "Ready to call " + num + ".", label: "📞 Call " + num, href: "tel:" + num };
    }
    if (!/\s/.test(rest)) {
      const c = getContact(rest);
      if (c) {
        return { text: "Ready to call " + c.n + ".", label: "📞 Call " + c.n, href: "tel:" + c.p };
      }
      if (!NOT_NAMES.includes(rest.toLowerCase())) {
        return {
          text: "I don't have a number for " + rest + ". Say 'save contact " + rest + " 9876543210' first.",
        };
      }
    }
    return null;
  }

  // text message
  m = t.match(/^(?:text|message|sms)\s+(\S+)\s+(?:saying\s+|that\s+)?(.+)$/i);
  if (m) {
    const target = m[1];
    const body = m[2].trim();
    if (NOT_NAMES.includes(target.toLowerCase())) return null;
    let num = null;
    let who = target;
    if (isNumber(target)) {
      num = cleanNumber(target);
    } else {
      const c = getContact(target);
      if (c) {
        num = c.p;
        who = c.n;
      }
    }
    if (!num) {
      return {
        text: "I don't have a number for " + target + ". Say 'save contact " + target + " 9876543210' first.",
      };
    }
    return {
      text: "Message to " + who + ": \"" + body + "\"",
      label: "💬 Open message",
      href: "sms:" + num + "?body=" + encodeURIComponent(body),
    };
  }

  // alarm: Android doesn't let web apps set alarms
  if (/^set (?:an )?alarm/i.test(t)) {
    return {
      text:
        "I can't set alarms from the installed web app, because Android doesn't let websites do that. Please use your Clock app. A native Android version of Kurama could do it later.",
    };
  }

  // maps
  m = t.match(/^(?:navigate to|directions to|take me to|find on maps?)\s+(.+)$/i);
  if (m) {
    return {
      text: "Opening maps for " + m[1] + ".",
      label: "🗺️ Open maps",
      href: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(m[1]),
      external: true,
    };
  }

  // youtube search
  m =
    t.match(/^(?:search youtube for|youtube search|search on youtube for)\s+(.+)$/i) ||
    t.match(/^play\s+(.+?)\s+on youtube$/i);
  if (m) {
    return {
      text: "YouTube search: " + m[1],
      label: "▶️ Open YouTube",
      href: "https://www.youtube.com/results?search_query=" + encodeURIComponent(m[1]),
      external: true,
    };
  }

  // google search
  m = t.match(/^(?:google|search(?: google)?(?: for)?)\s+(.+)$/i);
  if (m) {
    return {
      text: "Searching for: " + m[1],
      label: "🔎 Open search",
      href: "https://www.google.com/search?q=" + encodeURIComponent(m[1]),
      external: true,
    };
  }

  // open a site
  m = t.match(/^open\s+(.+)$/i);
  if (m) {
    const name = m[1].trim().toLowerCase().replace(/^the\s+/, "").replace(/\s+app$/, "");
    if (Object.prototype.hasOwnProperty.call(SITES, name)) {
      return { text: "Opening " + name + ".", label: "🚀 Open " + name, href: SITES[name], external: true };
    }
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(name)) {
      return { text: "Opening " + name + ".", label: "🚀 Open " + name, href: "https://" + name, external: true };
    }
    return null; // not a known site, let the AI answer
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

  // Phone actions never go to the AI either
  const action = image ? null : handlePhoneAction(text);
  if (action) {
    if (action.href) {
      addActionMessage(action.text, action.label, action.href, action.external);
    } else {
      addMessage(action.text, "kurama");
    }
    if (fromVoice) speak(action.text);
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

// New chat clears this conversation but keeps notes and contacts
newBtn.addEventListener("click", () => {
  if (!confirm("Start a new chat? Your saved notes and contacts will be kept.")) return;
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
