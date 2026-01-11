const express = require('express');
const cors = require('cors');
const path = require('path');
const { Telegraf, session } = require('telegraf');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

const GEMINI_KEY = process.env.GEMINI_KEY;
const TG_TOKEN = process.env.TG_TOKEN;

const bot = new Telegraf(TG_TOKEN);
bot.use(session());
app.use(express.static(path.join(__dirname)));

async function askGemini(text, history = []) {
    try {
        // Используем 1.5 Flash - она САМАЯ стабильная и бесплатная на сегодня
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
        
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: "Ты CyberBot v2.0. Знаешь Маркаряна. Отвечай кратко.\n\n" + text }] }]
            })
        });

        const data = await response.json();
        return data.candidates ? data.candidates[0].content.parts[0].text : "Ошибка ИИ";
    } catch (e) { return "Ошибка связи."; }
}

// ЭТОТ ПУТЬ ДОЛЖЕН БЫТЬ ТУТ:
app.post('https://my-bot-zbgv.onrender.com/chat', async (req, res) => {
    const { text, history } = req.body;
    const answer = await askGemini(text, history);
    res.json({ text: answer });
});

app.get('/', (req, res) => res.send('Server is up!'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Работаем на порту ${PORT}`);
    bot.launch();
});
