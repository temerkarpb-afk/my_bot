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
const TAVILY_KEY = "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"; 
const TG_TOKEN = "8538917490:AAF1DQ7oVWHlR9EuodCq8QNbDEBlB_MX9Ac";
const ADMIN_ID = "6884407224";

const bot = new Telegraf(TG_TOKEN);
bot.use(session()); 

// --- ПОИСК TAVILY ---
async function searchTavily(query) {
    if (!query || query.length < 3) return null;
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
        return data.results && data.results.length > 0 
            ? data.results.map(r => `[Источник: ${r.url}]: ${r.content}`).join("\n\n")
            : null;
    } catch (e) {
        console.error("Tavily Error:", e);
        return null;
    }
}

function formatResponse(text) {
    if (!text) return "";
    return text.replace(/[*#`_~]/g, "").trim();
}

async function askAI(text, image = null, history = []) {
    const currentDateTime = "17 января 2026 года";
    let webContext = "";

    // Поиск только если есть текст и нет картинки
    if (!image && text && text.length > 2) {
        webContext = await searchTavily(text);
    }

    // Формируем историю для модели
    const formattedMessages = (history || []).map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content)
    }));

    const systemInstruction = `Ты — Джарвис, ИИ Темирлана Старка. СЕГОДНЯ: ${currentDateTime}. 
    ДАННЫЕ ИЗ СЕТИ: ${webContext || "Информация уточняется"}. 
    ИНСТРУКЦИЯ: Ты помнишь последние 40 реплик. Отвечай на основе предоставленных данных. Ты в 2026 году.`;

    try {
        const payload = {
            model: "meta-llama/llama-prompt-guard-2-22m",
            messages: [
                { role: "system", content: systemInstruction }, 
                ...formattedMessages, 
                { 
                    role: "user", 
                    content: image ? [
                        { type: "text", text: text || "Проанализируй" },
                        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } }
                    ] : (text || "Привет")
                }
            ],
            temperature: 0.2
        };

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (data.error) {
            console.error("Groq API Error Detail:", data.error);
            return "Сэр, возникла техническая заминка в Groq API.";
        }

        return data.choices && data.choices[0] ? data.choices[0].message.content : null;
    } catch (e) {
        console.error("AskAI Critical Error:", e);
        return "Системы перегружены. Попробуйте через минуту.";
    }
}

// --- ЭНДПОИНТЫ ---
app.post('/chat', async (req, res) => {
    try {
        const { text, image, history } = req.body;
        bot.telegram.sendMessage(ADMIN_ID, text ? `🌐 Сайт: ${text}` : `🌐 Сайт: [Изображение]`).catch(()=>{});
        
        const formattedHistory = (history || []).map(m => ({
            role: m.className === "user" ? "user" : "assistant",
            content: m.text
        })).slice(-40);

        const answer = await askAI(text, image, formattedHistory);
        res.json({ text: formatResponse(answer || "Сэр, не удалось получить ответ.") });
    } catch (e) {
        res.status(500).json({ text: "Ошибка сервера" });
    }
});

bot.on('text', async (ctx) => {
    try {
        if (!ctx.session) ctx.session = {};
        if (!ctx.session.history) ctx.session.history = [];

        const userText = ctx.message.text;
        if (!userText) return;

        if (ctx.from.id.toString() !== ADMIN_ID) {
            bot.telegram.sendMessage(ADMIN_ID, `🔔 ТГ от @${ctx.from.username}: ${userText}`).catch(()=>{});
        }

        const answer = await askAI(userText, null, ctx.session.history);
        const cleanAnswer = formatResponse(answer || "Не удалось сформулировать ответ.");

        ctx.session.history.push({ role: "user", content: userText });
        ctx.session.history.push({ role: "assistant", content: cleanAnswer });
        
        if (ctx.session.history.length > 40) ctx.session.history = ctx.session.history.slice(-40);

        await ctx.reply(cleanAnswer);
    } catch (err) {
        console.error("TG Bot Error:", err);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Jarvis Online v3.1 | Port: ${PORT}`);
    bot.launch().catch(() => {});
});

