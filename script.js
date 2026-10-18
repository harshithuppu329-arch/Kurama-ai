const chat = document.getElementById("chat");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic");

// Paste your Worker address between the quotes, starting with https://
const WORKER_URL = "kurama-ai-backend.harshithuppu329.workers.dev";

function addMessage(text, who) {
  const div = document.createElement("div");
  div.className = "msg " + who;
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

async function sendMessage() {
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
      body: JSON.stringify({ message: text }),
    });
    const data = await res.json();
    thinking.textContent = data.reply || "Kurama couldn't answer. Try again.";
  } catch (e) {
    thinking.textContent = "Can't reach Kurama's brain. Check your internet.";
  }

  sendBtn.disabled = false;
  chat.scrollTop = chat.scrollHeight;
}

sendBtn.addEventListener("click", sendMessage);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

// Mic button: glow only for now. Real speech comes in Phase 3.
micBtn.addEventListener("click", () => {
  micBtn.classList.toggle("listening");
});
