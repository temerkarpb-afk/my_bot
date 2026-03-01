const express = require('express');
const cors = require('cors');
const path = require('path');
const { Telegraf, session } = require('telegraf');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname))); 

// --- КЛЮЧИ (ОСТАВЛЕНЫ БЕЗ ИЗМЕНЕНИЙ) ---
const GROQ_KEY = "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"; 
const TAVILY_KEY = "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"; 
const TG_TOKEN = "8538917490:AAF1DQ7oVWHlR9EuodCq8QNbDEBlB_MX9Ac";
const ADMIN_ID = "6884407224";

const bot = new Telegraf(TG_TOKEN);
bot.use(session()); 

// --- ФУНКЦИЯ ОПОВЕЩЕНИЯ ОБ ОШИБКАХ ---
async function sendAlert(errorType, errorMessage) {
    const alertText = `⚠️ **СИСТЕМНЫЙ СБОЙ ДЖАРВИСА**\n\n**Тип:** ${errorType}\n**Детали:** ${errorMessage}\n**Время:** ${new Date().toLocaleString()}`;
    try {
        await bot.telegram.sendMessage(ADMIN_ID, alertText, { parse_mode: 'Markdown' });
    } catch (e) {
        console.error("Не удалось оповестить админа:", e);
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
    const currentDateTime = "2 марта 2026 года";
    let webContext = await searchTavily(text);

    // ОПТИМИЗАЦИЯ ПАМЯТИ: Берем последние 8 сообщений (для выживания API)
    const contextHistory = (history || []).slice(-8).map(m => ({
        role: m.role,
        content: String(m.content).substring(0, 800)
    }));

    const systemInstruction = `Ты — Джарвис, ИИ Темирлана Старка. Сегодня: ${currentDateTime}. Будь краток.`;

    // СПИСОК МОДЕЛЕЙ ДЛЯ РОТАЦИИ (Если одна упала — берем следующую)
    const modelStack = [
        "llama-3.3-70b-versatile",
        "llama-3.1-8b-instant",
        "mixtral-8x7b-32768"
    ];

    for (let modelName of modelStack) {
        try {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                    model: modelName,
                    messages: [
                        { role: "system", content: systemInstruction }, 
                        ...contextHistory, 
                        { role: "user", content: String(text).substring(0, 1500) }
                    ],
                    temperature: 0.3
                })
            });
            
            const data = await response.json();
            
            if (data.choices && data.choices[0]) {
                return data.choices[0].message.content;
            }

            if (data.error) {
                const errCode = data.error.code || "unknown";
                const errMsg = data.error.message || "";

                if (errCode === "rate_limit_exceeded") {
                    console.log(`Модель ${modelName} превысила лимит, переключаюсь...`);
                    continue; 
                }
                
                if (errCode === "invalid_api_key") {
                    await sendAlert("GROQ API KEY", "Ваш ключ Groq недействителен.");
                    break;
                }
            }
        } catch (e) {
            console.error(`Ошибка связи с моделью ${modelName}`);
        }
    }
    return "Сэр, все системы ИИ временно перегружены. Попробуйте через пару минут.";
}

// --- ТЕЛЕГРАМ БОТ ---
bot.on('text', async (ctx) => {
    if (!ctx.session) ctx.session = { history: [] };
    const userText = ctx.message.text;

    if (ctx.from.id.toString() !== ADMIN_ID) {
        bot.telegram.sendMessage(ADMIN_ID, `🔔 ТГ от @${ctx.from.username}: ${userText}`).catch(()=>{});
    }

    const answer = await askAI(userText, null, ctx.session.history);
    const cleanAnswer = answer.replace(/[*#`_~]/g, "");

    ctx.session.history.push({ role: "user", content: userText });
    ctx.session.history.push({ role: "assistant", content: cleanAnswer });
    
    // В памяти сервера 40, но в API уходит только 8 (для стабильности)
    if (ctx.session.history.length > 40) ctx.session.history = ctx.session.history.slice(-40);

    ctx.reply(cleanAnswer);
});

// --- ЭНДПОИНТ САЙТА ---
app.post('/chat', async (req, res) => {
    try {
        const { text, history } = req.body;
        const formattedHistory = (history || []).map(m => ({
            role: m.className === "user" ? "user" : "assistant",
            content: m.text
        }));
        const answer = await askAI(text, null, formattedHistory);
        res.json({ text: answer.replace(/[*#`_~]/g, "") });
    } catch (e) {
        res.status(500).json({ text: "Ошибка сервера" });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Джарвис v6.1: Система выживания и алертов активна.`);
    bot.launch().catch(() => {});
});
        


