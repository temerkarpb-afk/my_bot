const express = require('express');
const cors = require('cors');
const path = require('path');
const { Telegraf, session } = require('telegraf');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname))); 

// --- ТВОИ КЛЮЧИ ---
const GROQ_KEY = "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";
const TAVILY_KEY = "ТВОЙ_КЛЮЧ_TAVILY"; // Получи ключ на tavily.com
const TG_TOKEN = "8538917490:AAF1DQ7oVWHlR9EuodCq8QNbDEBlB_MX9Ac";
const ADMIN_ID = "6884407224";

const bot = new Telegraf(TG_TOKEN);
bot.use(session()); // Сессии для хранения памяти

// --- МОДУЛЬ ПОИСКА TAVILY ---
async function searchTavily(query) {
    try {
        const response = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: TAVILY_KEY,
                query: query,
                search_depth: "advanced",
                max_results: 5
            })
        });
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
            return data.results.map(r => `[Инфо]: ${r.content}`).join("\n\n");
        }
        return "Актуальные данные не найдены.";
    } catch (e) {
        console.error("Tavily Error:", e);
        return "Ошибка поиска.";
    }
}

function formatResponse(text) {
    if (!text) return "";
    return text.replace(/[*#`_~]/g, "").trim();
}

async function askAI(text, image = null, history = []) {
    const currentDateTime = "16 января 2026 года";
    let webContext = "";

    if (!image && text) {
        console.log(`🔍 Поиск через Tavily: ${text}`);
        webContext = await searchTavily(text);
    }

    // Берем историю (теперь до 40 сообщений)
    const messages = (history || []).map(m => ({
        role: m.role,
        content: m.content
    }));

    const systemInstruction = `Ты — Джарвис, продвинутый ИИ Темирлана Старка.
    СЕГОДНЯШНЯЯ ДАТА: ${currentDateTime}.
    ТВОИ ЗНАНИЯ ОБНОВЛЕНЫ: Ты используешь систему Tavily для доступа к 2025-2026 годам.
    
    СВЕЖИЕ ДАННЫЕ ИЗ СЕТИ:
    ${webContext}
    
    ИНСТРУКЦИЯ: Ты помнишь контекст беседы (до 40 последних реплик). Игнорируй старые знания за 2023 год. Если данные из сети говорят о событиях 2025/2026 года, отвечай на их основе. Трамп — президент США. Ты в 2026 году. Будь вежлив, сэр.`;

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${GROQ_KEY}`, 
                "Content-Type": "application/json" 
            },
            body: JSON.stringify({
                model: "meta-llama/llama-4-scout-17b-16e-instruct",
                messages: [
                    { role: "system", content: systemInstruction }, 
                    ...messages, 
                    { 
                        role: "user", 
                        content: image ? [
                            { type: "text", text: text || "Что на картинке?" },
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } }
                        ] : text 
                    }
                ],
                temperature: 0.2
            })
        });
        
        const data = await response.json();
        if (data.choices && data.choices[0]) {
            return data.choices[0].message.content;
        }
    } catch (e) {
        return "Сэр, зафиксирован критический сбой в системе Groq.";
    }
}

// --- ЭНДПОИНТ ДЛЯ САЙТА ---
app.post('/chat', async (req, res) => {
    try {
        const { text, image, history } = req.body;
        bot.telegram.sendMessage(ADMIN_ID, `🌐 Сайт: ${text || "[Фото]"}`).catch(()=>{});
        
        const formattedHistory = (history || []).map(m => ({
            role: m.className === "user" ? "user" : "assistant",
            content: m.text
        })).slice(-40); // Ограничение 40 для сайта

        const answer = await askAI(text, image, formattedHistory);
        res.json({ text: formatResponse(answer) });
    } catch (e) {
        res.status(500).json({ text: "Ошибка сервера" });
    }
});

// --- ЛОГИКА ТЕЛЕГРАМ БОТА С УВЕЛИЧЕННОЙ ПАМЯТЬЮ ---
bot.on('text', async (ctx) => {
    if (!ctx.session) ctx.session = {};
    if (!ctx.session.history) ctx.session.history = [];

    const userText = ctx.message.text;

    if (ctx.from.id.toString() !== ADMIN_ID) {
        bot.telegram.sendMessage(ADMIN_ID, `🔔 ТГ от @${ctx.from.username}: ${userText}`).catch(()=>{});
    }

    const answer = await askAI(userText, null, ctx.session.history);
    const cleanAnswer = formatResponse(answer);

    // Добавляем в историю
    ctx.session.history.push({ role: "user", content: userText });
    ctx.session.history.push({ role: "assistant", content: cleanAnswer });
    
    // ПАМЯТЬ: Храним 40 реплик (20 пар диалога)
    if (ctx.session.history.length > 40) {
        ctx.session.history = ctx.session.history.slice(-40);
    }

    ctx.reply(cleanAnswer);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Джарвис Онлайн. Память: 40 реплик. Системы активны.`);
    bot.launch().catch(() => {});
});
