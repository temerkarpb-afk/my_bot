// На Render используем относительный путь
const API_URL = "/chat";

const messagesContainer = document.getElementById("messages");
const historyList = document.getElementById("history");
const input = document.getElementById("userInput");
const fileInput = document.getElementById("fileInput");
const sendBtn = document.getElementById("sendBtn");
const typingBox = document.getElementById("typing-box");

let currentChatId = localStorage.getItem("currentChatId") || null;
let selectedImageBase64 = null;

function renderMessage(author, text, className, isImage = false) {
    if (!messagesContainer) return;
    const div = document.createElement("div");
    div.className = `message ${className}`;
    if (isImage) {
        div.innerHTML = `<strong>${author}:</strong><br><img src="data:image/jpeg;base64,${text}" style="max-width:200px; border-radius:10px; cursor:pointer;" onclick="openImage(this.src)">`;
    } else {
        div.innerHTML = `<strong>${author}:</strong> ${text}`;
    }
    messagesContainer.appendChild(div);
    messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' });
}

async function sendMessage() {
    const text = input.value.trim();
    if (!text && !selectedImageBase64) return;

    const allChats = JSON.parse(localStorage.getItem("allChats")) || {};
    const chatHistory = allChats[currentChatId] || [];

    if (selectedImageBase64) {
        renderMessage("Вы", selectedImageBase64, "user", true);
        chatHistory.push({ author: "Вы", text: "IMAGEDATA:" + selectedImageBase64, className: "user" });
    }
    if (text) {
        renderMessage("Вы", text, "user", false);
        chatHistory.push({ author: "Вы", text: text, className: "user" });
    }

    const tempImg = selectedImageBase64;
    input.value = "";
    selectedImageBase64 = null;
    if (typingBox) typingBox.style.display = "flex";

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text: text,
                image: tempImg,
                history: chatHistory.map(m => ({
                    className: m.className,
                    text: m.text.startsWith("IMAGEDATA:") ? "[Изображение]" : m.text
                }))
            })
        });

        const data = await response.json();
        if (typingBox) typingBox.style.display = "none";

        renderMessage("Бот", data.text, "bot");
        chatHistory.push({ author: "Бот", text: data.text, className: "bot" });
        
        allChats[currentChatId] = chatHistory;
        localStorage.setItem("allChats", JSON.stringify(allChats));
    } catch (e) {
        if (typingBox) typingBox.style.display = "none";
        renderMessage("Бот", "❌ Ошибка связи", "bot");
    }
}

// --- Инициализация кнопок и событий ---
if (sendBtn) sendBtn.onclick = sendMessage;
if (input) input.onkeydown = (e) => { if (e.key === "Enter") sendMessage(); };

if (fileInput) {
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            selectedImageBase64 = reader.result.split(',')[1];
            renderMessage("Система", "🖼 Фото готово к отправке", "bot");
        };
        reader.readAsDataURL(file);
    };
}

function openImage(src) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImg');
    if(modal && modalImg) {
        modal.style.display = "flex";
        modalImg.src = src;
    }
}

// Логика создания чата при загрузке
window.onload = () => {
    if (!currentChatId) {
        currentChatId = "chat_" + Date.now();
        localStorage.setItem("currentChatId", currentChatId);
    }
};
