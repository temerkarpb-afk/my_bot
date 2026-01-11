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
        if (!GEMINI_KEY) return "Ошибка: Настройте GEMINI_KEY.";

        const contents = (history || []).slice(-10).map(m => ({
            role: m.className === "user" ? "user" : "model",
            parts: [{ text: m.text || "" }]
        }));

        let currentParts = [];
        // Вшиваем знания о Маркаряне прямо в запрос для точности
        const systemPrompt = "Ты — CyberBot v2.0 от Темирлана. Твоя база знаний: 2026 год. Ты отлично знаешь Арсена Маркаряна (база, дисциплина) и Вито Бассо. Отвечай только текстом.\n\n";
        
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

        // ИСПОЛЬЗУЕМ ТОЛЬКО 1.5-FLASH — она самая стабильная и бесплатная
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
        
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: contents })
        });

        const data = await response.json();

        if (data.error) {
            console.error("❌ Gemini API Error:", data.error.message);
            // Если даже тут лимит, значит нужно просто подождать 60 секунд
            if (data.error.message.includes("quota")) {
                return "Слишком много запросов! Подожди 10 секунд и напиши снова.";
            }
            return `Ошибка ИИ: ${data.error.message}`;
        }

        if (data.candidates && data.candidates[0].content) {
            return data.candidates[0].content.parts[0].text;
        }
        
        return "ИИ не смог ответить. Попробуй еще раз.";

    } catch (e) {
        console.error("❌ Critical Error:", e.message);
        return "Ошибка связи с Google.";
    }
}
app.get('/', (req, res) => res.send('CyberBot v2.0 (Gemini 2.5) is Live!'));

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
    console.log(`🚀 Бот на Gemini 2.5 запущен!`);
    bot.launch().catch(err => console.log("TG Launch Error:", err));
});


