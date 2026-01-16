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
    const currentFullDate = "16 января 2026 года";
    let internetContext = "";
    const lowerText = (text || "").toLowerCase();

    // ЖЕСТКАЯ КОРРЕКЦИЯ ДЛЯ АКТУАЛЬНОСТИ (Байден/Трамп/Новости)
    if (lowerText.includes("президент") || lowerText.includes("сша") || lowerText.includes("новости")) {
        // Мы принудительно вшиваем правду в контекст, если поиск может вернуть старье
        internetContext = " ИНФОРМАЦИЯ ИЗ СЕТИ 2026: Дональд Трамп является действующим президентом США (инаугурация прошла в январе 2025 года). Джо Байден покинул пост.";
    }

    // Дополнительный поиск для других тем
    if (lowerText.includes("курс") || lowerText.includes("погода")) {
        const found = await getWebData(text);
        if (found) internetContext += " Дополнительно: " + found;
    }

    const messages = (history || []).slice(-8).map(m => ({
        role: m.className === "user" ? "user" : "assistant",
        content: m.text
    }));

    // Ультимативный промпт - Джарвис не имеет права сомневаться в этой дате
    const systemInstruction = `Ты — Джарвис, ИИ Старка. 
    ВНИМАНИЕ: СЕГОДНЯ ${currentFullDate}. 
    ТВОИ ЗНАНИЯ ОБНОВЛЕНЫ В РЕАЛЬНОМ ВРЕМЕНИ. 
    Трамп — президент США. Байден — бывший президент. 
    Используй эти факты как единственно верные.`;

    try {
        // МЫ ВСТАВЛЯЕМ КОНТЕКСТ ПРЯМО В ТЕКСТ ПОЛЬЗОВАТЕЛЯ
        // Это заставляет ИИ думать, что это факт, предоставленный системой
        const finalUserText = image ? text : `[System Update: ${internetContext}] ${text}`;

        let userContent = image ? [
            { type: "text", text: text || "Анализ" },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } }
        ] : finalUserText;

        const response = await fetch("https://api.moonshot.cn/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${MOONSHOT_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "kimi-k2-instruct-0905",
                messages: [{ role: "system", content: systemInstruction }, ...messages, { role: "user", content: userContent }],
                temperature: 0.2 // Снижаем температуру, чтобы он меньше фантазировал
            })
        });
        const data = await response.json();
        if (data.choices && data.choices[0]) return data.choices[0].message.content;
    } catch (e) {
        console.log("Kimi Error");
    }

    // ЗАПАСКА (GROQ)
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "meta-llama/llama-4-scout-17b-16e-instruct",
                messages: [
                    { role: "system", content: systemInstruction }, 
                    ...messages, 
                    { role: "user", content: `[System Update: ${internetContext}] ${text}` }
                ],
                temperature: 0.2
            })
        });
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (e) {
        return "Ошибка систем. Попробуйте позже.";
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

