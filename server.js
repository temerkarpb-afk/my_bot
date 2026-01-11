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
        if (!GEMINI_KEY) return "Ошибка: Ключ GEMINI_KEY не найден в настройках Render.";

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

        // Важно: используем v1beta для поддержки system_instruction
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
        
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: contents,
                system_instruction: { 
                    parts: [{ text: "Ты продвинутый CyberBot v2.0 от Темирлана. Отвечай только текстом, без символов форматирования." }] 
                },
                generationConfig: { temperature: 0.7, maxOutputTokens: 1000 }
            })
        });

        // Если пришел HTML вместо JSON
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            const raw = await response.text();
            console.error("❌ Google вернул HTML вместо JSON. Возможно, бан региона или неверный URL.", raw.slice(0, 200));
            return "Ошибка: Google API вернул некорректный ответ (HTML). Проверьте регион сервера.";
        }

        const data = await response.json();
        if (data.error) {
            console.error("❌ Ошибка Gemini:", data.error.message);
            return `Ошибка ИИ: ${data.error.message}`;
        }

        return data.candidates[0].content.parts[0].text;
    } catch (e) {
        console.error("❌ Критическая ошибка:", e.message);
        return "Произошла ошибка при связи с Google.";
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
