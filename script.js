const LOCAL_SERVER_URL = "http://127.0.0.1:3000/chat";



const messagesContainer = document.getElementById("messages");

const historyList = document.getElementById("history");

const input = document.getElementById("userInput");

const fileInput = document.getElementById("fileInput");

const newChatBtn = document.getElementById("newChatBtn");

const sendBtn = document.getElementById("sendBtn");

const clearBtn = document.getElementById("clearBtn");

const typingBox = document.getElementById("typing-box");



let currentChatId = localStorage.getItem("currentChatId") || null;

let selectedImageBase64 = null;



// --- 1. ФУНКЦИИ ИНТЕРФЕЙСА (Объявляем в начале) ---



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

        // Ищем первое текстовое сообщение пользователя для заголовка

        const firstMsg = chat.find(m => m.className === "user")?.text || "Новый чат";

        const title = firstMsg.startsWith("IMAGEDATA:") ? "🖼 Фото-запрос" : firstMsg;



        const item = document.createElement("div");

        item.className = `history-item ${id === currentChatId ? 'active' : ''}`;

        item.onclick = () => loadChat(id);

       

        item.innerHTML = `

            <span title="${title}">${title.substring(0, 20)}...</span>

            <button class="delete-mini-btn" onclick="deleteChat('${id}', event)">×</button>

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



function deleteChat(id, event) {

    event.stopPropagation();

    let allChats = JSON.parse(localStorage.getItem("allChats")) || {};

    delete allChats[id];

    localStorage.setItem("allChats", JSON.stringify(allChats));

   

    if (currentChatId === id) {

        const remainingIds = Object.keys(allChats);

        if (remainingIds.length > 0) loadChat(remainingIds[0]);

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



    // Отображаем и сохраняем фото

    if (selectedImageBase64) {

        renderMessage("Вы", selectedImageBase64, "user", true);

        chatHistory.push({ author: "Вы", text: "IMAGEDATA:" + selectedImageBase64, className: "user" });

    }

   

    // Отображаем и сохраняем текст

    if (text) {

        renderMessage("Вы", text, "user", false);

        chatHistory.push({ author: "Вы", text: text, className: "user" });

    }



    const tempImage = selectedImageBase64;

    input.value = "";

    selectedImageBase64 = null;

    if (typingBox) typingBox.style.display = "flex";



    try {

       // Если ты запускаешь сайт на Render, лучше использовать относительный путь:
// Правильно для Render:
const response = await fetch('/chat', { 
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: userInput })
                text: text,

                image: tempImage,

                // Отправляем историю без последнего сообщения (оно еще в обработке у ИИ)

                history: chatHistory.slice(0, (tempImage && text ? -2 : -1)).map(m => ({

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

        renderMessage("Бот", "❌ Ошибка соединения", "bot");

    }

}



// --- 4. ИНИЦИАЛИЗАЦИЯ И СОБЫТИЯ ---



function initApp() {

    const allChats = JSON.parse(localStorage.getItem("allChats")) || {};

    if (!currentChatId || !allChats[currentChatId]) {

        createNewChat();

    } else {

        loadChat(currentChatId);

    }

}



window.onload = initApp;



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

        if (!file) return;

        const reader = new FileReader();

        reader.onload = () => {

            selectedImageBase64 = reader.result.split(',')[1];

            // Визуальное подтверждение выбора

            const notice = document.createElement("div");

            notice.style.cssText = "color: #25d366; font-size: 12px; margin: 5px 0; text-align: center;";

            notice.innerText = "🖼 Фото выбрано и готово к отправке";

            messagesContainer.appendChild(notice);

            messagesContainer.scrollTop = messagesContainer.scrollHeight;

        };

        reader.readAsDataURL(file);

    };

}

// Функция, которая открывает фото на весь экран

function openImage(src) {

    const modal = document.getElementById('imageModal');

    const modalImg = document.getElementById('modalImg');

    modal.style.display = "flex";

    modalImg.src = src;

}



// Закрытие при клике на любое место

document.getElementById('imageModal').onclick = function() {

    this.style.display = "none";


};








