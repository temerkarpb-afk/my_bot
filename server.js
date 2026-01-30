const express = require('express');
const cors = require('cors');
const path = require('path');
const { Telegraf, session } = require('telegraf');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname))); 

// --- КЛЮЧИ (ПРОВЕРЬТЕ ИХ ЕЩЕ РАЗ) ---
const GROQ_KEY = "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"; 
const TAVILY_KEY = "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"; 
const TG_TOKEN = "8538917490:AAF1DQ7oVWHlR9EuodCq8QNbDEBlB_MX9Ac";
const ADMIN_ID = "6884407224";

const bot = new Telegraf(TG_TOKEN);
bot.use(session()); 

// --- ПОИСК TAVILY (МАКСИМАЛЬНО СЖАТЫЙ) ---
async function searchTavily(query) {
    if (!query || query.length < 5) return null;
    try {
        const response = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: TAVILY_KEY,
                query: query,
                search_depth: "basic",
                max_results: 2 // Берем только 2 самых важных результата
            })
        });
        const data = await response.json();
        // Берем только первые 400 символов из каждого результата
        return data.results ? data.results.map(r => r.content.substring(0, 400)).join("\n") : null;
    } catch (e) { return null; }
}

async function askAI(text, image = null, history = []) {
    const currentDateTime = "25 января 2026 года";
    let webContext = "";

    // Поиск только если вопрос сложный
    if (!image && text && text.length > 8) {
        webContext = await searchTavily(text);
    }

    // ОПТИМИЗАЦИЯ ПАМЯТИ: Берем последние 8-10 сообщений
    const contextHistory = (history || []).slice(-10).map(m => ({
        role: m.role,
        content: String(m.content).substring(0, 1000) // Ограничиваем длину каждого сообщения в истории
    }));

    const systemInstruction = `Ты — Джарвис, ИИ бот. Сегодня: ${currentDateTime}. Трамп президент. Данные из сети: ${webContext || "база 2026"}. Будь краток.`;

    // Самая стабильная модель
    const model = "meta-llama/llama-4-scout-17b-16e-instruct";

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: "system", content: systemInstruction }, 
                    ...contextHistory, 
                    { role: "user", content: String(text).substring(0, 2000) } // Ограничиваем длину вопроса
                ],
                temperature: 0.3
            })
        });
        
        const data = await response.json();
        
        if (data.error) {
            console.error("DEBUG GROQ ERROR:", data.error);
            // Если всё равно ошибка длины, пробуем отправить ВООБЩЕ БЕЗ истории
            if (data.error.message.includes("length") || data.error.code === "rate_limit_exceeded") {
                 const retryRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: model,
                        messages: [
                            { role: "system", content: systemInstruction },
                            { role: "user", content: text }
                        ],
                        temperature: 0.2
                    })
                });
                const retryData = await retryRes.json();
                return retryData.choices?.[0]?.message?.content || "Сэр, даже с чистой памятью возникла ошибка.";
            }
            return "Сэр, зафиксирована ошибка: " + data.error.message;
        }

        return data.choices?.[0]?.message?.content || "Молчание со стороны сервера, сэр.";
    } catch (e) { return "Сэр, системы связи вышли из строя."; }
}

// --- ТЕЛЕГРАМ БОТ ---
bot.on('text', async (ctx) => {
    if (!ctx.session) ctx.session = { history: [] };
    const userText = ctx.message.text;

    // Уведомление админу
    if (ctx.from.id.toString() !== ADMIN_ID) {
        bot.telegram.sendMessage(ADMIN_ID, `🔔 ТГ: @${ctx.from.username}: ${userText}`).catch(()=>{});
    }

    const answer = await askAI(userText, null, ctx.session.history);
    const cleanAnswer = answer.replace(/[*#`_~]/g, "");

    ctx.session.history.push({ role: "user", content: userText });
    ctx.session.history.push({ role: "assistant", content: cleanAnswer });
    
    // В памяти сервера оставляем 40, но в API выше уйдет только 10
    if (ctx.session.history.length > 40) ctx.session.history = ctx.session.history.slice(-40);

    ctx.reply(cleanAnswer);
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
    console.log(`🚀 Джарвис стабилизирован. Контекстное окно под контролем.`);
    bot.launch().catch(() => {});
});




