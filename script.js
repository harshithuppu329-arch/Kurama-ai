const chat = document.getElementById("chat");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic");
const newBtn = document.getElementById("newchat");
const chatsBtn = document.getElementById("chats");
const panel = document.getElementById("panel");
const closePanelBtn = document.getElementById("closepanel");
const panelNewBtn = document.getElementById("panelnew");
const chatList = document.getElementById("chatlist");
const modeSel = document.getElementById("mode");
const webBtn = document.getElementById("web");
const photoBtn = document.getElementById("photo");
const fileInput = document.getElementById("file");

// True only inside the native Android app (it provides window.KuramaNative)
const NATIVE = typeof window.KuramaNative !== "undefined";

const WORKER_URL = "https://kurama-ai-backend.harshithuppu329.workers.dev";
const LANG = "en-IN"; // speech language
const STORE_KEY = "kurama_history_v1"; // old single chat (migrated once)
const CHATS_KEY = "kurama_chats_v1";
const FACTS_KEY = "kurama_facts_v1";
const MODE_KEY = "kurama_mode_v1";
const WEB_KEY = "kurama_web_v1";
const CONTACTS_KEY = "kurama_contacts_v1";
const MAX_FACTS = 30;
const MAX_CONTACTS = 50;
const MAX_CHATS = 30;
const GREETING = "I'm awake, Harshith! What are we doing today?";

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

// ---- Several saved chats ----
function newChatObj() {
  return {
    id: "c" + Date.now() + Math.random().toString(36).slice(2, 6),
    title: "New chat",
    updated: Date.now(),
    history: [],
  };
}

function titleFrom(h) {
  const first = (h || []).find((m) => m && m.role === "user");
  if (!first) return "";
  return first.text.replace(/^\[Sent a photo\]\s*/, "").slice(0, 30);
}

function loadStore() {
  try {
    const s = JSON.parse(localStorage.getItem(CHATS_KEY));
    if (s && Array.isArray(s.chats) && s.chats.length) {
      if (!s.chats.find((c) => c.id === s.current)) s.current = s.chats[0].id;
      return s;
    }
  } catch (e) {}
  // First time: move the old single chat into the new list
  const c = newChatObj();
  c.history = loadList(STORE_KEY);
  c.title = titleFrom(c.history) || "New chat";
  return { current: c.id, chats: [c] };
}

function saveStore() {
  try {
    localStorage.setItem(CHATS_KEY, JSON.stringify(store));
  } catch (e) {}
}

let store = loadStore();
saveStore();

function currentChat() {
  return store.chats.find((c) => c.id === store.current);
}

let history = currentChat().history; // the open chat
let facts = loadList(FACTS_KEY); // long-term notes
let contacts = loadObject(CONTACTS_KEY); // name -> {n, p}
let pendingImage = null; // photo waiting to be sent

// Save one exchange into the chat it belongs to
function recordExchange(chatId, userText, replyText) {
  const target = store.chats.find((c) => c.id === chatId);
  if (!target) return;
  target.history.push({ role: "user", text: userText });
  target.history.push({ role: "model", text: replyText });
  target.history = target.history.slice(-40);
  target.updated = Date.now();
  if (target.title === "New chat") {
    target.title = titleFrom(target.history) || "New chat";
  }
  if (target.id === store.current) history = target.history;
  saveStore();
}

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

// ---- Web search switch ----
let webOn = false;
try {
  webOn = localStorage.getItem(WEB_KEY) === "1";
} catch (e) {}
function renderWeb() {
  webBtn.textContent = webOn ? "🌐 Web: on" : "🌐 Web: off";
  webBtn.classList.toggle("on", webOn);
}
renderWeb();
webBtn.addEventListener("click", () => {
  webOn = !webOn;
  try {
    localStorage.setItem(WEB_KEY, webOn ? "1" : "0");
  } catch (e) {}
  renderWeb();
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

// Source links under a web-searched answer
function addSources(div, sources) {
  const box = document.createElement("div");
  box.className = "sources";
  box.appendChild(document.createTextNode("Sources:"));
  sources.forEach((s) => {
    if (!s || typeof s.url !== "string" || !s.url.startsWith("https://")) return;
    const a = document.createElement("a");
    a.href = s.url;
    a.textContent = "🔗 " + (s.title || "Source");
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    box.appendChild(a);
  });
  if (box.children.length) div.appendChild(box);
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

// Draw the open chat on screen
function renderChat() {
  chat.innerHTML = "";
  addMessage(GREETING, "kurama");
  history.forEach((m) =>
    addMessage(m.text, m.role === "user" ? "user" : "kurama")
  );
}
renderChat();

// ---- Chat list panel ----
function openChat(id) {
  if (!store.chats.find((c) => c.id === id)) return;
  store.current = id;
  saveStore();
  history = currentChat().history;
  pendingImage = null;
  input.placeholder = "Talk to Kurama...";
  window.speechSynthesis.cancel();
  renderChat();
}

function createChat() {
  // Don't pile up empty chats: reuse the open one if it's still empty
  if (!history.length) return true;
  if (store.chats.length >= MAX_CHATS) {
    alert("You have " + MAX_CHATS + " chats. Delete one first.");
    return false;
  }
  const c = newChatObj();
  store.chats.unshift(c);
  store.current = c.id;
  saveStore();
  history = c.history;
  pendingImage = null;
  input.placeholder = "Talk to Kurama...";
  window.speechSynthesis.cancel();
  renderChat();
  return true;
}

function renameChat(id) {
  const c = store.chats.find((x) => x.id === id);
  if (!c) return;
  const name = prompt("Rename chat", c.title);
  if (name && name.trim()) {
    c.title = name.trim().slice(0, 40);
    saveStore();
    renderList();
  }
}

function deleteChat(id) {
  const c = store.chats.find((x) => x.id === id);
  if (!c) return;
  if (!confirm('Delete "' + c.title + '"? This cannot be undone.')) return;
  store.chats = store.chats.filter((x) => x.id !== id);
  if (!store.chats.length) {
    const n = newChatObj();
    store.chats.push(n);
  }
  const wasCurrent = id === store.current;
  if (wasCurrent) {
    store.current = store.chats[0].id;
    history = currentChat().history;
    renderChat();
  }
  saveStore();
  renderList();
}

function renderList() {
  chatList.innerHTML = "";
  const sorted = store.chats.slice().sort((a, b) => b.updated - a.updated);
  sorted.forEach((c) => {
    const row = document.createElement("div");
    row.className = "chat-row" + (c.id === store.current ? " current" : "");

    const title = document.createElement("div");
    title.className = "chat-title";
    title.textContent = c.title;
    title.addEventListener("click", () => {
      openChat(c.id);
      panel.hidden = true;
    });

    const ren = document.createElement("button");
    ren.type = "button";
    ren.className = "icon-btn";
    ren.textContent = "✏️";
    ren.addEventListener("click", () => renameChat(c.id));

    const del = document.createElement("button");
    del.type = "button";
    del.className = "icon-btn";
    del.textContent = "🗑";
    del.addEventListener("click", () => deleteChat(c.id));

    row.appendChild(title);
    row.appendChild(ren);
    row.appendChild(del);
    chatList.appendChild(row);
  });
}

chatsBtn.addEventListener("click", () => {
  renderList();
  panel.hidden = false;
});
closePanelBtn.addEventListener("click", () => {
  panel.hidden = true;
});
panelNewBtn.addEventListener("click", () => {
  if (createChat()) panel.hidden = true;
});
newBtn.addEventListener("click", () => createChat());

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
  "• search black holes (opens Google)\n" +
  "• search youtube for anime openings\n" +
  "• navigate to Charminar\n" +
  "• call 9876543210 or call Mom\n" +
  "• text Mom I'm on my way\n" +
  "• save contact Mom 9876543210\n" +
  "• contacts / delete contact Mom\n" +
  "• set alarm for 6:30 am (native app only)";

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

  // alarm: only the native Android app can do this
  if (/^set (?:an )?alarm/i.test(t)) {
    const am = t
      .replace(/\./g, "")
      .match(/^set (?:an )?alarm (?:for|at)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (NATIVE && am) {
      let h = parseInt(am[1], 10);
      const mi = am[2] ? parseInt(am[2], 10) : 0;
      const ap = am[3] ? am[3].toLowerCase() : "";
      if (ap === "pm" && h < 12) h += 12;
      if (ap === "am" && h === 12) h = 0;
      if (h > 23 || mi > 59) {
        return { text: "That time doesn't look right. Try 'set alarm for 6:30 am'." };
      }
      const pad = (n) => String(n).padStart(2, "0");
      let ok = false;
      try {
        ok = window.KuramaNative.setAlarm(h, mi);
      } catch (e) {}
      return {
        text: ok
          ? "Asked your Clock app to set an alarm for " + pad(h) + ":" + pad(mi) + ". Please check the Clock app to confirm."
          : "I couldn't reach your Clock app. Please set the alarm there.",
      };
    }
    if (NATIVE) {
      return { text: "Try 'set alarm for 6:30 am'." };
    }
    return {
      text:
        "Alarms only work in the native Kurama app, because Android doesn't let websites set them. Please use your Clock app for now.",
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

  const chatId = store.current; // reply is saved to THIS chat
  pendingImage = null;
  input.placeholder = "Talk to Kurama...";
  sendBtn.disabled = true;
  const thinking = addMessage(
    image
      ? "Kurama is looking at your photo..."
      : webOn
      ? "Kurama is searching the web..."
      : "Kurama is thinking...",
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
        web: webOn,
        image: image ? { mime: image.mime, data: image.data } : undefined,
      }),
    });
    const data = await res.json();
    thinking.textContent =
      data.reply || "Error: " + (data.error || res.status);

    if (data.reply) {
      if (data.webFailed) {
        thinking.textContent +=
          "\n\n(Web search isn't available on this key right now, so I answered without it.)";
      }
      if (data.note) {
        thinking.textContent += "\n\n(" + data.note + ")";
      }
      if (Array.isArray(data.sources) && data.sources.length) {
        addSources(thinking, data.sources);
      }
      recordExchange(
        chatId,
        image ? "[Sent a photo] " + text : text,
        data.reply
      );
      if (fromVoice && chatId === store.current) speak(data.reply);
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

// ---- You speak ----
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;

if (SR && !NATIVE) {
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

// Native app: the phone's own speech recognizer does the listening
window.onNativeListening = (on) => {
  listening = on;
  micBtn.classList.toggle("listening", on);
  input.placeholder = on
    ? "Listening..."
    : pendingImage
    ? "Ask about the photo..."
    : "Talk to Kurama...";
};
window.onNativeSpeech = (text) => {
  input.value = text;
  sendMessage(true);
};
window.onNativeSpeechError = (msg) => {
  addMessage("Mic problem: " + msg, "kurama");
};

micBtn.addEventListener("click", () => {
  if (NATIVE) {
    if (listening) {
      window.KuramaNative.stopListening();
    } else {
      window.speechSynthesis.cancel();
      window.KuramaNative.startListening(LANG);
    }
    return;
  }
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
