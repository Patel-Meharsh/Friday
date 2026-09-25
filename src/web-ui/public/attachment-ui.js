const form = document.getElementById("chatForm");
const input = document.getElementById("message");
const voiceStatus = document.getElementById("voiceStatus");
const button = document.getElementById("attachButton");
const fileInput = document.createElement("input");
const chip = document.getElementById("attachmentChip");
const name = document.getElementById("attachmentName");
const remove = document.getElementById("attachmentRemove");

if (form && input && button && chip) {
  fileInput.type = "file";
  fileInput.accept = "image/png,image/jpeg,image/webp,image/gif";
  fileInput.hidden = true;
  document.body.appendChild(fileInput);

  let selectedFile = null;

  function clearAttachment() {
    selectedFile = null;
    fileInput.value = "";
    chip.hidden = true;
    name.textContent = "";
    voiceStatus.textContent = "Type a message or use your voice";
  }

  button.addEventListener("click", () => fileInput.click());
  remove?.addEventListener("click", clearAttachment);

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      clearAttachment();
      voiceStatus.textContent = "Please choose an image (PNG, JPG, WEBP or GIF).";
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      clearAttachment();
      voiceStatus.textContent = "That image is too large. Please keep it under 8 MB.";
      return;
    }
    selectedFile = file;
    name.textContent = file.name;
    chip.hidden = false;
    voiceStatus.textContent = "Image attached — add a question or press send.";
    input.focus();
  });

  form.addEventListener("submit", async (event) => {
    if (!selectedFile) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const prompt = input.value.trim() || "Analyze this image carefully and explain what you see. If it is code, an error, an MCQ, a UI, a document, or a technical screenshot, help me understand or solve it.";
    const file = selectedFile;
    button.disabled = true;
    voiceStatus.textContent = "Friday is analyzing the image…";

    try {
      const dataUrl = await readAsDataUrl(file);
      const response = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, prompt }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Image analysis failed.");

      saveAttachmentConversation(file.name, prompt, data.answer || "I couldn't analyze that image.");
      clearAttachment();
      input.value = "";
      window.location.reload();
    } catch (error) {
      voiceStatus.textContent = `Image analysis failed: ${error.message}`;
      button.disabled = false;
    }
  }, true);

  async function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Could not read the selected image."));
      reader.readAsDataURL(file);
    });
  }

  function saveAttachmentConversation(fileName, prompt, answer) {
    const key = "friday.web.chats.v2";
    let chats = [];
    try { chats = JSON.parse(localStorage.getItem(key) || "[]"); } catch { chats = []; }
    chats = chats.filter((chat) => chat && Array.isArray(chat.messages) && chat.messages.length > 0);

    const activeTitle = document.querySelector(".recent-row.active .recent-chat")?.textContent?.trim();
    let chat = activeTitle ? chats.find((item) => item.title === activeTitle) : null;
    if (!chat) {
      chat = { id: crypto.randomUUID(), title: prompt.slice(0, 48) || fileName, messages: [], createdAt: Date.now(), updatedAt: Date.now() };
      chats.unshift(chat);
    }
    chat.messages.push({ role: "user", content: `📎 ${fileName}\n${prompt}` });
    chat.messages.push({ role: "assistant", content: answer });
    chat.title = chat.title === "New chat" ? prompt.slice(0, 48) : chat.title;
    chat.updatedAt = Date.now();
    localStorage.setItem(key, JSON.stringify(chats));
  }
}
