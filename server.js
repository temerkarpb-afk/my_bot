const express = require('express');
const cors = require('cors');
const path = require('path');
const { Telegraf, session } = require('telegraf');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname))); 

const KIMI_KEY = "sk-apabbB7cauCvMQeLDfrKm1wZNc6Cw8UAW416iTiGOtXR3VUa";
const TG_TOKEN = "7763435522:AAHeXH2LYp0r6lrhpvODuw8-3JXW1maYDdE";
const ADMIN_ID = "6884407224";

const bot = new Telegraf(TG_TOKEN);
bot.use(session());

function formatResponse(text) {
    if (!text) return "";
    return text.replace(/[*#`_~]/g, "").trim();
}

async function askKimi(text, history = []) {
    try {
        const response = await fetch("https://api.moonshot.cn/v1/chat/completions", {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ТВОЙ_КЛЮЧ_MOONSHOT`, 
                "Content-Type": "application/json" 
            },
            body: JSON.stringify({
                model: "kimi-k2-instruct-0905",
                messages: [
                    { role: "system", content: "Ты CyberBot v3.0, мощный ИИ от Темирлана." },
                    ...history.map(m => ({
                        role: m.className === "user" ? "user" : "assistant",
                        content: m.text
                    })),
                    { role: "user", content: text }
                ],
                temperature: 0.3 // Для более точных и логичных ответов
            })
        });
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (e) {
        return "Ошибка соединения с Kimi API.";
    }
}

app.post('/chat', async (req, res) => {
    try {
        const { text, image, history } = req.body;
        const answer = await askGroq(text, image, history || []);
        res.json({ text: formatResponse(answer) });
    } catch (e) { res.status(500).json({ text: "Ошибка сервера" }); }
});

bot.on('text', async (ctx) => {
    if (!ctx.session) ctx.session = { h: [] };
    const answer = await askGroq(ctx.message.text, null, ctx.session.h);
    const clean = formatResponse(answer);
    ctx.session.h.push({ className: "user", text: ctx.message.text }, { className: "bot", text: clean });
    ctx.reply(clean);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Работаем на порту ${PORT}`);
    bot.launch().catch(() => console.log("Бот уже запущен."));
});


