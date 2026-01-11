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
const ADMIN_ID = process.env.ADMIN_ID;
const bot = new Telegraf(TG_TOKEN);
bot.use(session());
app.use(express.static(path.join(__dirname)));

async function askGemini(text, history = []) {
    // Список моделей: сначала пробуем Gemini 3, если нет - 1.5 Flash
    const modelOptions = ["gemini-3-pro-preview", "gemini-1.5-flash"];
    
    for (const modelId of modelOptions) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${GEMINI_KEY}`;
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ 
                        role: "user", 
                        parts: [{ text: "Ты CyberBot v3.0 от Темирлана. Знаешь базу Арсена Маркаряна. Отвечай кратко.\n\n" + text }] 
                    }]
                })
            });

            const data = await response.json();

            // Если квота превышена или модель не найдена — пробуем следующую
            if (data.error && (data.error.message.includes("quota") || data.error.message.includes("not found"))) {
                console.warn(`⚠️ Модель ${modelId} недоступна, пробую запасную...`);
                continue; 
            }

            if (data.candidates) {
                return data.candidates[0].content.parts[0].text;
            }
        } catch (e) {
            console.error("Ошибка запроса:", e.message);
        }
    }
    return "Все линии ИИ сейчас заняты. Попробуй через минуту.";
}

// ЭТОТ БЛОК УБИРАЕТ 404
app.post('/chat', async (req, res) => {
    try {
        const { text } = req.body;
        const answer = await askGemini(text);
        res.json({ text: answer });
    } catch (err) {
        res.status(500).json({ error: "Ошибка сервера" });
    }
});
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



