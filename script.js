const SERVER_URL = "/chat";

const messagesContainer = document.getElementById("messages");
const historyList = document.getElementById("history");
const input = document.getElementById("userInput");
const fileInput = document.getElementById("fileInput");
const sendBtn = document.getElementById("sendBtn");
const typingBox = document.getElementById("typing-box");

let currentChatId = localStorage.getItem("currentChatId") || "chat_" + Date.now();
let selectedImageBase64 = null;

function renderMessage(author, text, className, isImage = false) {
    const div = document.createElement("div");
    div.className = `message ${className}`;
    if (isImage) {
        div.innerHTML = `<strong>${author}:</strong><br><img src="data:image/jpeg;base64,${text}" style="max-width:200px; border-radius:10px;">`;
    } else {
        div.innerHTML = `<strong>${author}:</strong> ${text}`;
    }
    messagesContainer.appendChild(div);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function sendMessage() {
    const text = input.value.trim();
    if (!text && !selectedImageBase64) return;

    renderMessage("Вы", text || "🖼 Фото", "user");
    if (selectedImageBase64) renderMessage("Вы", selectedImageBase64, "user", true);

    const tempImage = selectedImageBase64;
    input.value = "";
    selectedImageBase64 = null;
    if (typingBox) typingBox.style.display = "flex";

    try {
        const response = await fetch(SERVER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                text: text, 
                image: tempImage,
                history: [] // Для простоты пока без длинной истории
            })
        });

        const data = await response.json();
        if (typingBox) typingBox.style.display = "none";
        
        renderMessage("Бот", data.text, "bot");
    } catch (e) {
        if (typingBox) typingBox.style.display = "none";
        renderMessage("Бот", "❌ Ошибка OpenAI. Проверь баланс ключа.", "bot");
    }
}

sendBtn.onclick = sendMessage;
input.onkeydown = (e) => { if (e.key === "Enter") sendMessage(); };

fileInput.onchange = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = () => { selectedImageBase64 = reader.result.split(',')[1]; };
    reader.readAsDataURL(file);
};
