const express = require('express');
const cors = require('cors');
const path = require('path');
const { Telegraf, session } = require('telegraf');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname))); 

// --- КЛЮЧИ (НЕ ТРОНУТЫ) ---
const GROQ_KEY = "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"; 
const TAVILY_KEY = "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"; 
const TG_TOKEN = "8538917490:AAF1DQ7oVWHlR9EuodCq8QNbDEBlB_MX9Ac";
const ADMIN_ID = "6884407224";

const bot = new Telegraf(TG_TOKEN);
bot.use(session()); 

// --- ФУНКЦИЯ ОПОВЕЩЕНИЯ АДМИНА ОБ ОШИБКАХ ---
async function sendAlert(errorType, errorMessage) {
    const alertText = `⚠️ **СИСТЕМНЫЙ СБОЙ ДЖАРВИСА**\n\n**Тип:** ${errorType}\n**Детали:** ${errorMessage}\n**Время:** ${new Date().toLocaleString()}`;
    try {
        await bot.telegram.sendMessage(ADMIN_ID, alertText, { parse_mode: 'Markdown' });
    } catch (e) {
        console.error("Не удалось отправить алерт:", e);
    }
}

// --- ПОИСК TAVILY (С МОНИТОРИНГОМ) ---
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
                max_results: 2
            })
        });
        
        if (response.status === 401) {
            await sendAlert("TAVILY API ERROR", "Ключ Tavily недействителен.");
            return null;
        }

        const data = await response.json();
        return data.results ? data.results.map(r => r.content.substring(0, 400)).join("\n") : null;
    } catch (e) { return null; }
}

async function askAI(text, image = null, history = []) {
    const currentDateTime = "9 февраля 2026 года";
    let webContext = "";

    if (!image && text && text.length > 8) {
        webContext = await searchTavily(text);
    }

    const contextHistory = (history || []).slice(-10).map(m => ({
        role: m.role,
        content: String(m.content).substring(0, 1000)
    }));

    const systemInstruction = `Ты — Джарвис, ИИ бот. Сегодня: ${currentDateTime}. Трамп президент. Данные из сети: ${webContext || "база 2026"}. Будь краток.`;
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
                    { role: "user", content: String(text).substring(0, 2000) }
                ],
                temperature: 0.3
            })
        });
        
        const data = await response.json();
        
        // МОНИТОРИНГ ОШИБОК GROQ
        if (data.error) {
            const errCode = data.error.code || "unknown";
            const errMsg = data.error.message || "";

            if (errCode === "invalid_api_key") {
                await sendAlert("GROQ API KEY", "Ключ Groq недействителен.");
            } else if (errCode === "rate_limit_exceeded") {
                await sendAlert("GROQ LIMITS", "Лимиты Groq исчерпаны.");
            } else if (errMsg.includes("length")) {
                await sendAlert("CONTEXT OVERLOAD", "Слишком длинный диалог для модели.");
            }

            // Пытаемся ответить без истории при перегрузке
            if (errMsg.includes("length") || errCode === "rate_limit_exceeded") {
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
                return retryData.choices?.[0]?.message?.content || "Сэр, системы перегружены.";
            }
            return "Сэр, возникла ошибка: " + errMsg;
        }

        return data.choices?.[0]?.message?.content || "Молчание сервера.";
    } catch (e) { 
        await sendAlert("CRITICAL ERROR", e.message);
        return "Сэр, системы связи вышли из строя."; 
    }
}

// --- ТЕЛЕГРАМ БОТ ---
bot.on('text', async (ctx) => {
    if (!ctx.session) ctx.session = { history: [] };
    const userText = ctx.message.text;

    if (ctx.from.id.toString() !== ADMIN_ID) {
        bot.telegram.sendMessage(ADMIN_ID, `🔔 ТГ: @${ctx.from.username}: ${userText}`).catch(()=>{});
    }

    const answer = await askAI(userText, null, ctx.session.history);
    const cleanAnswer = answer.replace(/[*#`_~]/g, "");

    ctx.session.history.push({ role: "user", content: userText });
    ctx.session.history.push({ role: "assistant", content: cleanAnswer });
    
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
    console.log(`🚀 Джарвис v5.2: Стабильность и мониторинг.`);
    bot.launch().catch(() => {});
});





