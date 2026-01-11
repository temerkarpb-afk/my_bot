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

// --- 1. АНИМАЦИИ И РЕНДЕР ---

function renderMessage(author, text, className, isImage = false) {
    if (!messagesContainer) return;
    const div = document.createElement("div");
    div.className = `message ${className} animate-fade-in`; // Добавили класс анимации
    
    if (isImage) {
        div.innerHTML = `<strong>${author}:</strong><br><img src="data:image/jpeg;base64,${text}" class="chat-img" onclick="openImage(this.src)">`;
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
        const title = firstMsg.startsWith("IMAGEDATA:") ? "🖼 Фото" : firstMsg;

        const item = document.createElement("div");
        item.className = `history-item ${id === currentChatId ? 'active' : ''}`;
        item.onclick = () => loadChat(id); // Клик по чату работает
        
        item.innerHTML = `
            <span>${title.substring(0, 20)}...</span>
            <button class="delete-mini-btn" onclick="event.stopPropagation(); deleteChat('${id}')">×</button>
        `;
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
    renderMessage("Система", "Чат очищен. Жду твой запрос.", "bot");
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

// --- 3. ОТПРАВКА ---

async function sendMessage() {
    const text = input.value.trim();
    if (!text && !selectedImageBase64) return;

    const allChats = JSON.parse(localStorage.getItem("allChats")) || {};
    const chatHistory = allChats[currentChatId] || [];

    // Показываем свои сообщения сразу
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
    
    // Включаем анимацию загрузки
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
        if (typingBox) typingBox.style.display = "none"; // Выключаем анимацию

        renderMessage("Бот", data.text, "bot");
        chatHistory.push({ author: "Бот", text: data.text, className: "bot" });
        
        allChats[currentChatId] = chatHistory;
        localStorage.setItem("allChats", JSON.stringify(allChats));
        updateHistoryUI();
    } catch (e) {
        if (typingBox) typingBox.style.display = "none";
        renderMessage("Бот", "❌ Ошибка связи с сервером", "bot");
    }
}

// --- 4. СОБЫТИЯ ---

if (sendBtn) sendBtn.onclick = sendMessage;
if (newChatBtn) newChatBtn.onclick = createNewChat;
if (clearBtn) {
    clearBtn.onclick = () => {
        if(confirm("Удалить все чаты?")) {
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
            // Небольшая "анимация" готовности фото
            const tip = document.createElement("div");
            tip.className = "bot-notice animate-fade-in";
            tip.innerText = "🖼 Фото прикреплено";
            messagesContainer.appendChild(tip);
        };
        reader.readAsDataURL(file);
    };
}

function openImage(src) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImg');
    if (modal && modalImg) {
        modal.style.display = "flex";
        modalImg.src = src;
    }
}

// Закрытие модалки
const modal = document.getElementById('imageModal');
if(modal) modal.onclick = () => modal.style.display = "none";

// Старт приложения
const chats = JSON.parse(localStorage.getItem("allChats")) || {};
if (!currentChatId || !chats[currentChatId]) createNewChat();
else loadChat(currentChatId);
