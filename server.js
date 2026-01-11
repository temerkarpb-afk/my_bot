const express = require('express');
const cors = require('cors');
const path = require('path');
const { Telegraf, session } = require('telegraf');

// Динамический импорт fetch для node-fetch v3
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
        if (!GEMINI_KEY) return "Ошибка: Настройте GEMINI_KEY на Render.";

        const contents = (history || []).slice(-10).map(m => ({
            role: m.className === "user" ? "user" : "model",
            parts: [{ text: m.text || "" }]
        }));

        let currentParts = [];
        const systemPrompt = "Ты CyberBot v2.0 от Темирлана. Знаешь Арсена Маркаряна и Вито Бассо. Пиши только чистый текст. \n\n";
        
        if (image) {
            currentParts.push({
                inline_data: {
                    mime_type: "image/jpeg",
                    data: image.replace(/^data:image\/\w+;base64,/, "")
                }
            });
        }
        
        currentParts.push({ text: systemPrompt + (text || "Привет") });
        contents.push({ role: "user", parts: currentParts });

        // ПРОБУЕМ МОДЕЛЬ GEMINI-1.5-PRO (Она мощнее и доступнее в v1)
        const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro:generateContent?key=${GEMINI_KEY}`;
        
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: contents })
        });

        const data = await response.json();

        if (data.error) {
            console.error("❌ Gemini API Error:", data.error.message);
            // Если Pro тоже не найдена, пробуем последнюю попытку с исправленным путем Flash
            return `Ошибка ИИ: ${data.error.message}. Проверьте тип модели в консоли Google.`;
        }

        if (data.candidates && data.candidates[0].content) {
            return data.candidates[0].content.parts[0].text;
        } else {
            return "ИИ не смог ответить. Попробуйте другой вопрос.";
        }

    } catch (e) {
        console.error("❌ Critical Error:", e.message);
        return "Ошибка связи с Google.";
    }
}

app.get('/', (req, res) => res.send('CyberBot is Running!'));

app.post('/chat', async (req, res) => {
    try {
        const { text, image, history } = req.body;
        const answer = await askGemini(text, image, history);
        res.json({ text: answer.replace(/[*#`_~]/g, "").trim() });
    } catch (e) { res.status(500).json({ text: "Ошибка сервера" }); }
});

bot.on('text', async (ctx) => {
    try {
        if (!ctx.session) ctx.session = { h: [] };
        const answer = await askGemini(ctx.message.text, null, ctx.session.h);
        const cleanAnswer = answer.replace(/[*#`_~]/g, "").trim();
        ctx.reply(cleanAnswer);
        ctx.session.h.push({ className: "user", text: ctx.message.text }, { className: "assistant", text: cleanAnswer });
    } catch (e) { console.log("TG Error:", e.message); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Бот запущен на порту ${PORT}`);
    bot.launch().catch(err => console.log("TG Launch Error:", err));
});


