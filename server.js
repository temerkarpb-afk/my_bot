const express = require('express');
const cors = require('cors');
const path = require('path');
const { Telegraf, session } = require('telegraf');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname))); 

// ВСЕ ТВОИ КЛЮЧИ
const MOONSHOT_KEY = "sk-apabbB7cauCvMQeLDfrKm1wZNc6Cw8UAW416iTiGOtXR3VUa";
const GROQ_KEY = "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";
const TG_TOKEN = "8538917490:AAF1DQ7oVWHlR9EuodCq8QNbDEBlB_MX9Ac";
const ADMIN_ID = "6884407224";

const bot = new Telegraf(TG_TOKEN);
bot.use(session());

// --- УЛУЧШЕННЫЙ ПОИСК (СПОСОБ №3: СТРУКТУРИРОВАННЫЕ ДАННЫЕ) ---
async function getWebData(query) {
    try {
        const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
        const data = await response.json();
        
        let info = "";
        if (data.AbstractText) info = data.AbstractText;
        else if (data.RelatedTopics && data.RelatedTopics.length > 0) {
            info = data.RelatedTopics.slice(0, 3).map(t => t.Text).join(" | ");
        }
        
        return info || "Актуальные данные в процессе обновления...";
    } catch (e) {
        console.log("Ошибка поиска v3");
        return "";
    }
}

function formatResponse(text) {
    if (!text) return "";
    return text.replace(/[*#`_~]/g, "").trim();
}

async function askAI(text, image = null, history = []) {
    // ДИНАМИЧЕСКАЯ ДАТА (Всегда актуально)
    const now = new Date();
    const currentDateTime = now.toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' });

    let internetContext = "";
    const lowerText = (text || "").toLowerCase();
    
    // Триггеры для выхода в интернет
    const triggers = ["новости", "сегодня", "курс", "кто такой", "погода", "результат", "события", "президент", "цена"];
    
    if (triggers.some(t => lowerText.includes(t)) && !image) {
        console.log("Джарвис анализирует сеть...");
        const searchResult = await getWebData(text);
        if (searchResult) {
            internetContext = `\n[АКТУАЛЬНЫЕ ДАННЫЕ ИЗ СЕТИ НА ${currentDateTime}]: ${searchResult}\n`;
        }
    }

    const messages = (history || []).slice(-8).map(m => ({
        role: m.className === "user" ? "user" : "assistant",
        content: m.text
    }));

    // Ультимативный системный промпт против галлюцинаций
    const systemInstruction = `Ты — Джарвис, ИИ Темирлана Старка. 
    СЕГОДНЯ: ${currentDateTime}. 
    ВНИМАНИЕ: Если ниже предоставлены 'АКТУАЛЬНЫЕ ДАННЫЕ', используй ТОЛЬКО их для ответа на вопросы о текущих событиях. 
    Никогда не выдумывай новости прошлых лет (например, про COVID или старые выборы). 
    Если информации нет, отвечай исходя из того, что сейчас январь 2026 года.`;

    // --- 1. MOONSHOT (KIMI) ---
    try {
        let userContent = image ? [
            { type: "text", text: text || "Что на фото?" },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } }
        ] : (internetContext + (text || "Привет"));

        const response = await fetch("https://api.moonshot.cn/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${MOONSHOT_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "kimi-k2-instruct-0905",
                messages: [{ role: "system", content: systemInstruction }, ...messages, { role: "user", content: userContent }],
                temperature: 0.3
            })
        });
        const data = await response.json();
        if (data.choices && data.choices[0]) return data.choices[0].message.content;
    } catch (e) {
        console.log("Kimi Mode Error");
    }

    // --- 2. GROQ ЗАПАСКА (Llama 4 Scout) ---
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "meta-llama/llama-4-scout-17b-16e-instruct",
                messages: [
                    { role: "system", content: systemInstruction + " Ты также обладаешь зрением." }, 
                    ...messages, 
                    { role: "user", content: (internetContext + (text || "Привет")) }
                ],
                temperature: 0.6
            })
        });
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (e) {
        return "Сэр, возникли помехи в канале связи Stark Industries. Попробуйте снова.";
    }
}

// ЭНДПОИНТЫ
app.post('/chat', async (req, res) => {
    try {
        const { text, image, history } = req.body;
        bot.telegram.sendMessage(ADMIN_ID, `🌐 Сайт: ${text || "[Фото]"}`).catch(()=>{});
        const answer = await askAI(text, image, history);
        res.json({ text: formatResponse(answer) });
    } catch (e) {
        res.status(500).json({ text: "Ошибка сервера" });
    }
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
    console.log(`🚀 Jarvis Online | Current Date: ${new Date().toLocaleDateString()}`);
    bot.launch().catch(() => {});
});
