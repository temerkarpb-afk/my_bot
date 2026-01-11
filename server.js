const express = require('express');
const cors = require('cors');
const path = require('path');
const { Telegraf, session } = require('telegraf');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname))); 

const MOONSHOT_KEY = "sk-apabbB7cauCvMQeLDfrKm1wZNc6Cw8UAW416iTiGOtXR3VUa";
const GROQ_KEY = "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";
const TG_TOKEN = "7763435522:AAHeXH2LYp0r6lrhpvODuw8-3JXW1maYDdE";
const ADMIN_ID = "6884407224";

async function askAI(text, image, history) {
    const messages = (history || []).slice(-8).map(m => ({
        role: m.className === "user" ? "user" : "assistant",
        content: m.text
    }));

    // 1. Пробуем Moonshot (Kimi)
    try {
        const response = await fetch("https://api.moonshot.cn/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${MOONSHOT_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "kimi-k2-instruct-0905",
                messages: [...messages, { role: "user", content: text || "Привет" }],
                temperature: 0.3
            })
        });
        const data = await response.json();
        if (!data.error) return data.choices[0].message.content;
    } catch (e) {}

    // 2. Если Kimi упал — используем Groq (он точно работает)
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{role: "system", content: "Ты CyberBot v3.0 от Темирлана."}, ...messages, {role: "user", content: text}],
                temperature: 0.6
            })
        });
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (e) { return "Ошибка обоих провайдеров ИИ."; }
}

app.post('/chat', async (req, res) => {
    const answer = await askAI(req.body.text, req.body.image, req.body.history);
    res.json({ text: answer.replace(/[*#_`~]/g, "") });
});

const bot = new Telegraf(TG_TOKEN);
bot.on('text', async (ctx) => {
    const answer = await askAI(ctx.message.text);
    ctx.reply(answer);
});

app.listen(process.env.PORT || 10000, () => {
    console.log("🚀 Бот запущен!");
    bot.launch().catch(() => {});
});
