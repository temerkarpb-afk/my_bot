const express = require('express');
const cors = require('cors');
const path = require('path');
const { Telegraf, session } = require('telegraf');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

// Переменные окружения (Берите их из настроек Render!)
const GEMINI_KEY = process.env.GEMINI_KEY; 
const TG_TOKEN = process.env.TG_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;

const bot = new Telegraf(TG_TOKEN);
bot.use(session());
app.use(express.static(path.join(__dirname)));

async function askGemini(text, image = null, history = []) {
    try {
        if (!GEMINI_KEY) return "Ошибка: Ключ GEMINI_KEY не найден.";

        // Преобразование истории в формат Gemini
        const contents = (history || []).slice(-10).map(m => ({
            role: m.className === "user" ? "user" : "model",
            parts: [{ text: m.text || "" }]
        }));

        let currentParts = [];
        if (image) {
            currentParts.push({
                inline_data: {
                    mime_type: "image/jpeg",
                    data: image.replace(/^data:image\/\w+;base64,/, "")
                }
            });
        }
        currentParts.push({ text: text || "Привет" });
        contents.push({ role: "user", parts: currentParts });

        // ИСПОЛЬЗУЕМ СТАБИЛЬНУЮ ВЕРСИЮ v1 (она надежнее для generateContent)
        const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
        
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: contents,
                // Системная инструкция для стабильной версии v1 передается немного иначе в некоторых случаях, 
                // но Gemini 1.5 Flash понимает её в блоке systemInstruction
                systemInstruction: { 
                    parts: [{ text: "Ты продвинутый CyberBot v2.0 от Темирлана. Твоя база знаний актуальна на 2026 год. Ты знаешь Арсена Маркаряна, Вито Бассо и других медийных личностей. Пиши только чистый текст без символов * # _." }] 
                },
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1000
                }
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error("❌ Gemini API Error:", data.error.message);
            return `Ошибка ИИ: ${data.error.message}`;
        }

        if (data.candidates && data.candidates[0].content) {
            return data.candidates[0].content.parts[0].text;
        } else {
            console.error("❌ Неожиданный ответ:", data);
            return "ИИ не смог ответить. Попробуйте перефразировать запрос.";
        }

    } catch (e) {
        console.error("❌ Critical Error:", e.message);
        return "Произошла ошибка при связи с Google ИИ.";
    }
}

// Маршруты
app.get('/', (req, res) => res.send('CyberBot is Running on Gemini 1.5!'));

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
    bot.launch();
});

