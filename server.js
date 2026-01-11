const express = require('express');
const cors = require('cors');
const path = require('path');
const { Telegraf, session } = require('telegraf');

// Динамический импорт fetch для ноды
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

// Твой новый ключ OpenAI (рекомендую все же положить его в Environment Variables на Render как OPENAI_KEY)
const OPENAI_KEY = process.env.OPENAI_KEY || 
const TG_TOKEN = process.env.TG_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;

const bot = new Telegraf(TG_TOKEN);
bot.use(session());
app.use(express.static(path.join(__dirname)));

async function askOpenAI(text, image = null, history = []) {
    try {
        const messages = [
            { role: "system", content: "Ты — CyberBot v3.0 от Темирлана. Твоя база знаний 2026 год. Ты отлично знаешь Арсена Маркаряна и Вито Бассо. Отвечай кратко и по делу." }
        ];

        // Добавляем историю
        history.slice(-5).forEach(m => {
            messages.push({ role: m.className === "user" ? "user" : "assistant", content: m.text });
        });

        // Формируем текущее сообщение
        let userContent = [{ type: "text", text: text || "Привет" }];
        
        if (image) {
            userContent.push({
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${image}` }
            });
        }

        messages.push({ role: "user", content: userContent });

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${OPENAI_KEY}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini", // Самая быстрая и дешевая модель
                messages: messages,
                max_tokens: 1000
            })
        });

        const data = await response.json();
        
        if (data.error) {
            console.error("OpenAI Error:", data.error.message);
            return "Ошибка OpenAI: " + data.error.message;
        }

        return data.choices[0].message.content;

    } catch (e) {
        console.error("Critical Error:", e);
        return "Ошибка связи с сервером OpenAI.";
    }
}

app.post('/chat', async (req, res) => {
    const { text, image, history } = req.body;
    const answer = await askOpenAI(text, image, history);
    res.json({ text: answer });
});

app.get('/', (req, res) => res.send('CyberBot (OpenAI Edition) is running!'));

bot.on('text', async (ctx) => {
    if (!ctx.session) ctx.session = { h: [] };
    const answer = await askOpenAI(ctx.message.text, null, ctx.session.h);
    ctx.reply(answer);
    ctx.session.h.push({ className: "user", text: ctx.message.text }, { className: "assistant", text: answer });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Сервер на порту ${PORT} (OpenAI)`);
    if(TG_TOKEN) bot.launch();
});
