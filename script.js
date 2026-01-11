const API_URL = "/chat";
const messagesContainer = document.getElementById("messages");
const historyList = document.getElementById("history");
const input = document.getElementById("userInput");
const fileInput = document.getElementById("fileInput");
const sendBtn = document.getElementById("sendBtn");
const clearBtn = document.getElementById("clearBtn");
const newChatBtn = document.getElementById("newChatBtn");
const typingBox = document.getElementById("typing-box");

let currentChatId = localStorage.getItem("currentChatId");
let selectedImageBase64 = null;

// --- 1. ОТОБРАЖЕНИЕ СООБЩЕНИЙ ---
function renderMessage(author, text, className, isImage = false) {
    if (!messagesContainer) return;
    const div = document.createElement("div");
    div.className = `message ${className} animate-fade-in`; 
    
    if (isImage) {
        div.innerHTML = `<strong>${author}:</strong><br><img src="data:image/jpeg;base64,${text}" class="chat-img" onclick="openImage(this.src)">`;
    } else {
        div.innerHTML = `<strong>${author}:</strong> ${text}`;
    }
    
    messagesContainer.appendChild(div);
    messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' });
}

// --- 2. ЛОГИКА ИСТОРИИ (КЛИКАБЕЛЬНОСТЬ) ---
function updateHistoryUI() {
    if (!historyList) return;
    const allChats = JSON.parse(localStorage.getItem("allChats")) || {};
    historyList.innerHTML = "";
    
    Object.keys(allChats).sort().reverse().forEach(id => {
        const chat = allChats[id];
        const firstMsg = chat.find(m => m.className === "user")?.text || "Новый чат";
        const title = firstMsg.substring(0, 15) + (firstMsg.length > 15 ? "..." : "");

        const item = document.createElement("div");
        item.className = `history-item ${id === currentChatId ? 'active' : ''}`;
        
        // ВОЗВРАЩАЕМ КЛИК НА ЧАТ
        item.onclick = () => loadChat(id); 

        item.innerHTML = `
            <span>${title}</span>
            <button class="delete-mini-btn" onclick="event.stopPropagation(); deleteChat('${id}')">×</button>
        `;
        historyList.appendChild(item);
    });
}

function createNewChat() {
    currentChatId = "chat_" + Date.now();
    localStorage.setItem("currentChatId", currentChatId);
    
    const allChats = JSON.parse(localStorage.getItem("allChats")) || {};
    allChats[currentChatId] = [];
    localStorage.setItem("allChats", JSON.stringify(allChats));
    
    messagesContainer.innerHTML = "";
    renderMessage("CyberBot", "Новый чат создан. Чем могу помочь?", "bot");
    updateHistoryUI();
}

function loadChat(id) {
    currentChatId = id;
    localStorage.setItem("currentChatId", id);
    const allChats = JSON.parse(localStorage.getItem("allChats")) || {};
    const messages = allChats[id] || [];
    
    messagesContainer.innerHTML = "";
    messages.forEach(msg => {
        const isImg = msg.text.startsWith("IMAGEDATA:");
        const cleanText = isImg ? msg.text.replace("IMAGEDATA:", "") : msg.text;
        renderMessage(msg.author, cleanText, msg.className, isImg);
    });
    updateHistoryUI();
}

function deleteChat(id) {
    let allChats = JSON.parse(localStorage.getItem("allChats")) || {};
    delete allChats[id];
    localStorage.setItem("allChats", JSON.stringify(allChats));
    if (currentChatId === id) createNewChat();
    else updateHistoryUI();
}

// --- 3. ОТПРАВКА С АНИМАЦИЕЙ ---
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
    
    // ВКЛЮЧАЕМ АНИМАЦИЮ
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
                    text: m.text.startsWith("IMAGEDATA:") ? "[Фото]" : m.text
                }))
            })
        });

        const data = await response.json();
        
        // ВЫКЛЮЧАЕМ АНИМАЦИЮ
        if (typingBox) typingBox.style.display = "none";

        renderMessage("CyberBot", data.text, "bot");
        chatHistory.push({ author: "CyberBot", text: data.text, className: "bot" });
        
        allChats[currentChatId] = chatHistory;
        localStorage.setItem("allChats", JSON.stringify(allChats));
        updateHistoryUI();
        
    } catch (e) {
        if (typingBox) typingBox.style.display = "none";
        renderMessage("CyberBot", "❌ Ошибка сервера.", "bot");
    }
}

// --- 4. СОБЫТИЯ ---
sendBtn.onclick = sendMessage;
newChatBtn.onclick = createNewChat;
clearBtn.onclick = () => {
    if(confirm("Очистить всю историю?")) {
        localStorage.clear();
        location.reload();
    }
};

input.onkeydown = (e) => { if (e.key === "Enter") sendMessage(); };

fileInput.onchange = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = () => {
        selectedImageBase64 = reader.result.split(',')[1];
        renderMessage("Система", "🖼 Фото выбрано", "bot");
    };
    reader.readAsDataURL(file);
};

// Старт
if (!currentChatId) createNewChat();
else loadChat(currentChatId);
