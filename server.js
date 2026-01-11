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
    // Список моделей по приоритету: сначала самая новая 2.0, потом стабильная 1.5
    const models = ["gemini-2.0-flash-exp", "gemini-1.5-flash"];
    
    for (let modelName of models) {
        try {
            if (!GEMINI_KEY) return "Ошибка: Настройте GEMINI_KEY.";

            const contents = (history || []).slice(-10).map(m => ({
                role: m.className === "user" ? "user" : "model",
                parts: [{ text: m.text || "" }]
            }));

            let currentParts = [];
            const systemPrompt = "Ты CyberBot v2.0 от Темирлана. Знаешь всё про Арсена Маркаряна и Вито Бассо. Отвечай только текстом.\n\n";
            
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

            // Пробуем текущую модель из списка
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_KEY}`;
            
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: contents })
            });

            const data = await response.json();

            // Если модель не найдена, переходим к следующей в списке
            if (data.error && (data.error.status === "NOT_FOUND" || data.error.message.includes("not found"))) {
                console.log(`⚠️ Модель ${modelName} не найдена, пробуем следующую...`);
                continue; 
            }

            if (data.error) return `Ошибка ИИ: ${data.error.message}`;

            if (data.candidates && data.candidates[0].content) {
                return data.candidates[0].content.parts[0].text;
            }
        } catch (e) {
            console.error(`❌ Ошибка с моделью ${modelName}:`, e.message);
        }
    }
    return "К сожалению, ни одна модель ИИ сейчас не доступна.";
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

