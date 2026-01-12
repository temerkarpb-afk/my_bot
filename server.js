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
const TG_TOKEN = "7763435522:AAHeXH2LYp0r6lrhpvODuw8-3JXW1maYDdE";
const ADMIN_ID = "6884407224";

const bot = new Telegraf(TG_TOKEN);
bot.use(session());

function formatResponse(text) {
    if (!text) return "";
    return text.replace(/[*#`_~]/g, "").trim();
}

// ОСНОВНАЯ ФУНКЦИЯ С ЗАПАСКОЙ
async function askAI(text, image = null, history = []) {
    const messages = (history || []).slice(-8).map(m => ({
        role: m.className === "user" ? "user" : "assistant",
        content: m.text
    }));

    // --- 1. ПОПЫТКА ЧЕРЕЗ MOONSHOT (KIMI) ---
    try {
        let userContent = image ? [
            { type: "text", text: text || "Что на фото?" },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } }
        ] : text || "Привет";

        const response = await fetch("https://api.moonshot.cn/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${MOONSHOT_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "kimi-k2-instruct-0905",
                messages: [{ role: "system", content: "Ты CyberBot v3.0 от Темирлана." }, ...messages, { role: "user", content: userContent }],
                temperature: 0.3
            })
        });
        const data = await response.json();
        if (data.choices && data.choices[0]) return data.choices[0].message.content;
        console.log("Kimi не ответил, переключаюсь на Groq...");
    } catch (e) {
        console.log("Ошибка Kimi, пробую Groq...");
    }

    // --- 2. ЗАПАСКА: GROQ (LLAMA 3.3) ---
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "meta-llama/llama-guard-4-12b",
                messages: [{ role: "system", content: "Ты чат-бот по имени Джарвис Твой создатель Темирлан Старк." }, ...messages, { role: "user", content: text || "Привет" }],
                temperature: 0.6
            })
        });
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (e) {
        return "Ошибка всех нейросетей. Проверьте баланс или API ключи.";
    }
}

// ЭНДПОИНТ ДЛЯ САЙТА
app.post('/chat', async (req, res) => {
    try {
        const { text, image, history } = req.body;
        
        // Уведомление админу в ТГ (Сайт)
        bot.telegram.sendMessage(ADMIN_ID, `🌐 Сайт: ${text || "[Фото]"}`).catch(()=>{});
        
        const answer = await askAI(text, image, history);
        res.json({ text: formatResponse(answer) });
    } catch (e) {
        res.status(500).json({ text: "Ошибка сервера" });
    }
});

// ЛОГИКА ТЕЛЕГРАМ БОТА
bot.on('text', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) {
        bot.telegram.sendMessage(ADMIN_ID, `🔔 ТГ от @${ctx.from.username}: ${ctx.message.text}`).catch(()=>{});
    }
    const answer = await askAI(ctx.message.text);
    ctx.reply(formatResponse(answer));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    bot.launch().catch(() => {});
});


