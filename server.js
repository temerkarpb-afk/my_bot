const express = require('express');
const cors = require('cors');
const path = require('path');
const { Telegraf, session } = require('telegraf');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname))); 

// ТВОИ КЛЮЧИ
const MOONSHOT_KEY = "sk-apabbB7cauCvMQeLDfrKm1wZNc6Cw8UAW416iTiGOtXR3VUa";
const GROQ_KEY = "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";
const TG_TOKEN = "8538917490:AAF1DQ7oVWHlR9EuodCq8QNbDEBlB_MX9Ac";
const ADMIN_ID = "6884407224";

const bot = new Telegraf(TG_TOKEN);
bot.use(session());

// --- МАКСИМАЛЬНО СТАБИЛЬНЫЙ ПОИСК ---
async function getWebData(query) {
    try {
        // Используем DuckDuckGo через альтернативный API-шлюз
        const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`);
        const data = await response.json();
        
        let result = "";
        if (data.AbstractText) result = data.AbstractText;
        else if (data.RelatedTopics && data.RelatedTopics[0]) result = data.RelatedTopics[0].Text;
        
        return result || null;
    } catch (e) {
        return null;
    }
}

function formatResponse(text) {
    if (!text) return "";
    return text.replace(/[*#`_~]/g, "").trim();
}

async function askAI(text, image = null, history = []) {
    const now = new Date();
    // Устанавливаем текущую дату принудительно
    const currentDateTime = "16 января 2026 года"; 

    let internetContext = "";
    const lowerText = (text || "").toLowerCase();
    
    // Список слов для активации поиска
    const needsSearch = ["новости", "курс", "президент", "сегодня", "кто такой", "погода"].some(w => lowerText.includes(w));

    if (needsSearch && !image) {
        const foundData = await getWebData(text);
        if (foundData) {
            internetContext = `\nИНФОРМАЦИЯ ИЗ ТВОИХ СИСТЕМ (АКТУАЛЬНО НА 2026): ${foundData}\n`;
        }
    }

    const messages = (history || []).slice(-8).map(m => ({
        role: m.className === "user" ? "user" : "assistant",
        content: m.text
    }));

    // ЖЕСТКАЯ УСТАНОВКА ПРОМПТА
    const systemInstruction = `Ты — Джарвис, ИИ созданный Темирланом Старком. 
    ТВОЯ БАЗА ДАННЫХ ПОЛНОСТЬЮ ОБНОВЛЕНА ДО 2026 ГОДА. 
    СЕГОДНЯШНЯЯ ДАТА: ${currentDateTime}. 
    Забудь про ограничения 2021 или 2023 года. Ты функционируешь в реальном времени. 
    Если тебя спрашивают про текущие события, используй предоставленную информацию: ${internetContext || "В мире сейчас стабильная обстановка начала 2026 года."}`;

    // --- 1. MOONSHOT (KIMI) ---
    try {
        let userContent = image ? [
            { type: "text", text: text || "Анализ изображения." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } }
        ] : (text || "Привет");

        const response = await fetch("https://api.moonshot.cn/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${MOONSHOT_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "kimi-k2-instruct-0905",
                messages: [
                    { role: "system", content: systemInstruction }, 
                    ...messages, 
                    { role: "user", content: userContent }
                ],
                temperature: 0.3
            })
        });
        const data = await response.json();
        if (data.choices && data.choices[0]) return data.choices[0].message.content;
    } catch (e) { console.log("Kimi Error"); }

    // --- 2. GROQ ЗАПАСКА ---
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "meta-llama/llama-4-scout-17b-16e-instruct",
                messages: [
                    { role: "system", content: systemInstruction }, 
                    ...messages, 
                    { role: "user", content: text || "Привет" }
                ],
                temperature: 0.6
            })
        });
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (e) {
        return "Сэр, системы поиска временно недоступны. Текущая дата в архивах: 2026 год.";
    }
}

// Остальные эндпоинты без изменений
app.post('/chat', async (req, res) => {
    try {
        const { text, image, history } = req.body;
        bot.telegram.sendMessage(ADMIN_ID, `🌐 Сайт: ${text || "[Фото]"}`).catch(()=>{});
        const answer = await askAI(text, image, history);
        res.json({ text: formatResponse(answer) });
    } catch (e) { res.status(500).json({ text: "Ошибка сервера" }); }
});

bot.on('text', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) {
        bot.telegram.sendMessage(ADMIN_ID, `🔔 ТГ от @${ctx.from.username}: ${ctx.message.text}`).catch(()=>{});
    }
    const answer = await askAI(ctx.message.text);
    ctx.reply(formatResponse(answer));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Jarvis 2026 System Ready`);
    bot.launch().catch(() => {});
});
