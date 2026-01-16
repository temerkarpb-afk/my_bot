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
        // Добавлен класс chat-img для стилей и onclick для просмотра
        div.innerHTML = `<strong>${author}:</strong><br><img src="data:image/jpeg;base64,${text}" class="chat-img" style="max-width:250px; cursor:pointer; border-radius:10px; margin-top:5px;" onclick="openImage(this.src)">`;
    } else {
        div.innerHTML = `<strong>${author}:</strong> ${text}`;
    }
    
    messagesContainer.appendChild(div);
    messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' });
}

// --- НОВОЕ: ФУНКЦИЯ ПРОСМОТРА ИЗОБРАЖЕНИЙ ---
function openImage(src) {
    let modal = document.getElementById('imageModal');
    let modalImg = document.getElementById('modalImg');
    
    // Если элементов модалки нет в HTML, мы их не трогаем, но функция готова
    if (modal && modalImg) {
        modal.style.display = "flex";
        modalImg.src = src;
    } else {
        // Альтернативный вариант, если нет модалки — открыть в новой вкладке
        window.open(src, '_blank');
    }
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

async function sendMessage() {
    const text = input.value.trim();
    if (!text && !selectedImageBase64) return;

    const allChats = JSON.parse(localStorage.getItem("allChats")) || {};
    const chatHistory = allChats[currentChatId] || [];

    // --- НОВОЕ: ОПРЕДЕЛЕНИЕ ВРЕМЕНИ ---
    const now = new Date();
    const currentTime = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const currentDate = now.toLocaleDateString('ru-RU');
    // ---------------------------------

    const imgToSend = selectedImageBase64;

    if (imgToSend) {
        renderMessage("Вы", imgToSend, "user", true);
        chatHistory.push({ author: "Вы", text: "IMAGEDATA:" + imgToSend, className: "user" });
    }
    if (text) {
        renderMessage("Вы", text, "user", false);
        chatHistory.push({ author: "Вы", text: text, className: "user" });
    }

    input.value = "";
    selectedImageBase64 = null;
    
    if (typingBox) typingBox.style.display = "flex";

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                // Добавляем время в текст запроса, чтобы Джарвис его знал
                text: `(Системное время: ${currentDate}, ${currentTime}) ${text || "Что на фото?"}`, 
                image: imgToSend,
                history: chatHistory.slice(-6).map(m => ({
                    className: m.className,
                    text: m.text.startsWith("IMAGEDATA:") ? "[Изображение]" : m.text
                }))
            })
        });

        const data = await response.json();
        if (typingBox) typingBox.style.display = "none";

        renderMessage("CyberBot", data.text, "bot");
        chatHistory.push({ author: "CyberBot", text: data.text, className: "bot" });
        
        allChats[currentChatId] = chatHistory;
        localStorage.setItem("allChats", JSON.stringify(allChats));
        updateHistoryUI();
        
    } catch (e) {
        if (typingBox) typingBox.style.display = "none";
        renderMessage("CyberBot", "❌ Ошибка соединения", "bot");
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
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = () => {
        selectedImageBase64 = reader.result.split(',')[1];
        // Подсказка пользователю, что фото готово
        const notice = document.createElement("div");
        notice.style.cssText = "color: #25d366; font-size: 12px; text-align: center; margin: 5px;";
        notice.innerText = "🖼 Фото готово к отправке";
        messagesContainer.appendChild(notice);
        messagesContainer.scrollTo({ top: messagesContainer.scrollHeight, behavior: 'smooth' });
    };
    reader.readAsDataURL(file);
};

// Закрытие модалки при клике
const modal = document.getElementById('imageModal');
if (modal) {
    modal.onclick = () => modal.style.display = "none";
}

// Старт
if (!currentChatId) createNewChat();
else loadChat(currentChatId);

const currentTime = new Date().getTime();
console.log(currentTime);



