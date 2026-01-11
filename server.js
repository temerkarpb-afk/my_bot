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

async function askGemini(text, image = null, history = []) {
    try {
        if (!GEMINI_KEY) return "Ошибка: Ключ GEMINI_KEY не найден в настройках Render.";

        // Оставляем только самое важное для экономии токенов
        const contents = (history || []).slice(-6).map(m => ({
            role: m.className === "user" ? "user" : "model",
            parts: [{ text: m.text || "" }]
        }));

        let currentParts = [];
        const systemPrompt = "Ты — CyberBot v2.0 от Темирлана. Знаешь Арсена Маркаряна и Вито Бассо. Отвечай кратко.\n\n";
        
        if (image) {
            currentParts.push({
                inline_data: { mime_type: "image/jpeg", data: image }
            });
        }
        
        currentParts.push({ text: systemPrompt + (text || "Привет") });
        contents.push({ role: "user", parts: currentParts });

        // Используем 1.5-flash — она НИКОГДА не выдает ошибку "not found"
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
        
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: contents })
        });

        const data = await response.json();

        if (data.error) {
            console.error("Гугол ругается:", data.error.message);
            return `Ошибка ИИ: ${data.error.message}`; 
        }

        if (data.candidates && data.candidates[0].content) {
            return data.candidates[0].content.parts[0].text;
        }
        
        return "ИИ прислал пустой ответ. Попробуй еще раз.";

    } catch (e) {
        console.error("Критическая ошибка:", e);
        return "Ошибка связи: " + e.message;
    }
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





