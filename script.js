const API_URL = "/chat";

const messagesContainer = document.getElementById("messages");
const historyList = document.getElementById("history");
const input = document.getElementById("userInput");
const fileInput = document.getElementById("fileInput");
const newChatBtn = document.getElementById("newChatBtn");
const sendBtn = document.getElementById("sendBtn");
const clearBtn = document.getElementById("clearBtn");
const typingBox = document.getElementById("typing-box");

let currentChatId = localStorage.getItem("currentChatId");
let selectedImageBase64 = null;

// --- 1. ФУНКЦИИ ИНТЕРФЕЙСА ---

function renderMessage(author, text, className, isImage = false) {
    if (!messagesContainer) return;
    const div = document.createElement("div");
    div.className = `message ${className}`;
    
    if (isImage) {
        div.innerHTML = `<strong>${author}:</strong><br><img src="data:image/jpeg;base64,${text}" style="max-width:200px; border-radius:10px; margin-top:5px; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">`;
    } else {
        div.innerHTML = `<strong>${author}:</strong> ${text}`;
    }
    
    messagesContainer.appendChild(div);
    messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' });
}

function updateHistoryUI() {
    if (!historyList) return;
    const allChats = JSON.parse(localStorage.getItem("allChats")) || {};
    historyList.innerHTML = "";
    
    Object.keys(allChats).sort().reverse().forEach(id => {
        const chat = allChats[id];
        const firstMsg = chat.find(m => m.className === "user")?.text || "Новый чат";
        const title = firstMsg.startsWith("IMAGEDATA:") ? "🖼 Фото-запрос" : firstMsg;

        const item = document.createElement("div");
        item.className = `history-item ${id === currentChatId ? 'active' : ''}`;
        
        const textSpan = document.createElement("span");
        textSpan.innerText = title.substring(0, 20) + "...";
        textSpan.onclick = () => loadChat(id);
        
        const delBtn = document.createElement("button");
        delBtn.className = "delete-mini-btn";
        delBtn.innerText = "×";
        delBtn.onclick = (e) => { e.stopPropagation(); deleteChat(id); };

        item.appendChild(textSpan);
        item.appendChild(delBtn);
        historyList.appendChild(item);
    });
}

// --- 2. ЛОГИКА ЧАТОВ ---

function createNewChat() {
    currentChatId = "chat_" + Date.now();
    localStorage.setItem("currentChatId", currentChatId);
    
    const allChats = JSON.parse(localStorage.getItem("allChats")) || {};
    allChats[currentChatId] = [];
    localStorage.setItem("allChats", JSON.stringify(allChats));
    
    messagesContainer.innerHTML = "";
    renderMessage("Система", "Новый чат создан!", "bot");
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
    
    if (currentChatId === id) {
        const ids = Object.keys(allChats);
        if (ids.length > 0) loadChat(ids[0]);
        else createNewChat();
    } else {
        updateHistoryUI();
    }
}

// --- 3. ОТПРАВКА СООБЩЕНИЙ ---

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

    const tempImage = selectedImageBase64;
    input.value = "";
    selectedImageBase64 = null;
    if (typingBox) typingBox.style.display = "flex";

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text: text,
                image: tempImage,
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
        updateHistoryUI();
        
    } catch (e) {
        if (typingBox) typingBox.style.display = "none";
        renderMessage("Бот", "❌ Ошибка сервера", "bot");
    }
}

// --- 4. ИНИЦИАЛИЗАЦИЯ ---

if (sendBtn) sendBtn.onclick = sendMessage;
if (newChatBtn) newChatBtn.onclick = createNewChat;
if (clearBtn) {
    clearBtn.onclick = () => {
        if(confirm("Удалить все чаты навсегда?")) {
            localStorage.clear();
            location.reload();
        }
    };
}
if (input) {
    input.onkeydown = (e) => { if (e.key === "Enter") sendMessage(); };
}

if (fileInput) {
    fileInput.onchange = (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = () => {
            selectedImageBase64 = reader.result.split(',')[1];
            const n = document.createElement("div");
            n.style.cssText = "color: #25d366; font-size: 12px; text-align: center; margin: 5px;";
            n.innerText = "🖼 Фото выбрано";
            messagesContainer.appendChild(n);
        };
        reader.readAsDataURL(file);
    };
}

// Запуск приложения
const existingChats = JSON.parse(localStorage.getItem("allChats")) || {};
if (!currentChatId || !existingChats[currentChatId]) {
    createNewChat();
} else {
    loadChat(currentChatId);
}
