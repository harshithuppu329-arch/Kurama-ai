const chat = document.getElementById("chat");
const input = document.getElementById("input");
const sendBtn = document.getElementById("send");
const micBtn = document.getElementById("mic");

function addMessage(text, who) {
  const div = document.createElement("div");
  div.className = "msg " + who;
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function sendMessage() {
  const text = input.value.trim();
  if (!text) return;
  addMessage(text, "user");
  input.value = "";
  // Placeholder reply. In Phase 2 this becomes the real AI brain.
  setTimeout(() => {
    addMessage("AI brain not connected yet. Coming in Phase 2!", "kurama");
  }, 600);
}

sendBtn.addEventListener("click", sendMessage);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

// Mic button: glow only for now. Real speech comes in Phase 3.
micBtn.addEventListener("click", () => {
  micBtn.classList.toggle("listening");
});