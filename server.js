const express = require('express');
const cors = require('cors');
const path = require('path');
const { Telegraf, session } = require('telegraf');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname))); 

// --- КЛЮЧИ ---
const GROQ_KEY = "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"; 
const TAVILY_KEY = "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"; 
const TG_TOKEN = "8538917490:AAF1DQ7oVWHlR9EuodCq8QNbDEBlB_MX9Ac";
const ADMIN_ID = "6884407224";

const bot = new Telegraf(TG_TOKEN);
bot.use(session()); 

// --- ПОИСК TAVILY (Оптимизированный) ---
async function searchTavily(query) {
    if (!query || query.length < 3) return null;
    try {
        const response = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: TAVILY_KEY,
                query: query,
                search_depth: "basic", // "basic" короче и быстрее
                max_results: 3 // Берем только 3 главных результата
            })
        });
        const data = await response.json();
        // Обрезаем текст каждого результата до 500 символов
        return data.results ? data.results.map(r => r.content.substring(0, 500)).join("\n") : null;
    } catch (e) { return null; }
}

async function askAI(text, image = null, history = []) {
    const currentDateTime = "17 января 2026 года";
    let webContext = "";

    // Поиск только для важных вопросов
    if (!image && text && text.length > 5) {
        webContext = await searchTavily(text);
    }

    // ОГРАНИЧЕНИЕ ПАМЯТИ: Берем только последние 12 сообщений для отправки в API
    // Это решит проблему с ошибкой "reduce the length"
    const contextHistory = (history || []).slice(-12).map(m => ({
        role: m.role,
        content: String(m.content)
    }));

    const systemInstruction = `Ты — Джарвис, ИИ Старка. Сегодня: ${currentDateTime}. 
    Данные 2026: ${webContext || "базовые системы"}. 
    Инструкция: Трамп президент. Будь краток и точен.`;

    // Используем самую стабильную модель для длинных контекстов
    const model = "llama-3.3-70b-versatile";

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: "system", content: systemInstruction }, 
                    ...contextHistory, 
                    { role: "user", content: text || "Привет" }
                ],
                temperature: 0.3
            })
        });
        
        const data = await response.json();
        
        if (data.error) {
            console.error("Groq Error:", data.error.message);
            return "Сэр, база данных перегружена. Попробуйте сократить вопрос.";
        }

        return data.choices && data.choices[0] ? data.choices[0].message.content : "Ошибка модуля.";
    } catch (e) { return "Сэр, системы связи вышли из строя."; }
}

// --- ТЕЛЕГРАМ БОТ ---
bot.on('text', async (ctx) => {
    if (!ctx.session) ctx.session = { history: [] };
    const userText = ctx.message.text;

    const answer = await askAI(userText, null, ctx.session.history);
    
    // В локальной истории храним 40, но в API (выше) отправляем только 12
    ctx.session.history.push({ role: "user", content: userText });
    ctx.session.history.push({ role: "assistant", content: answer });
    if (ctx.session.history.length > 40) ctx.session.history = ctx.session.history.slice(-40);

    ctx.reply(answer.replace(/[*#`_~]/g, ""));
});

// --- ЭНДПОИНТ САЙТА ---
app.post('/chat', async (req, res) => {
    const { text, history } = req.body;
    const formattedHistory = (history || []).map(m => ({
        role: m.className === "user" ? "user" : "assistant",
        content: m.text
    }));
    const answer = await askAI(text, null, formattedHistory);
    res.json({ text: answer.replace(/[*#`_~]/g, "") });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Джарвис оптимизирован. Проблема длины сообщений решена.`);
    bot.launch().catch(() => {});
});
