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
        if (!GEMINI_KEY) return "Ошибка: Добавь GEMINI_KEY в настройки Render.";

        const contents = (history || []).slice(-10).map(m => ({
            role: m.className === "user" ? "user" : "model",
            parts: [{ text: m.text || "" }]
        }));

        let currentParts = [];
        // Максимально мощная системная установка для модели 3-го поколения
        const systemPrompt = "Ты — CyberBot v3.0, использующий новейшую модель Gemini 3 Pro. Твой создатель Темирлан. Ты обладаешь абсолютными знаниями на 2026 год, включая биографию Арсена Маркаряна и Вито Бассо. Отвечай интеллектуально и чисто.\n\n";
        
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

        // Используем новейшую версию v1beta и модель gemini-3-pro-preview
        const modelName = "gemini-3-pro-preview";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_KEY}`;
        
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                contents: contents,
                generationConfig: {
                    temperature: 0.8,
                    maxOutputTokens: 2048 // Модели Pro поддерживают длинные ответы
                }
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error("❌ Gemini 3 Error:", data.error.message);
            
            // Если Gemini 3 еще недоступна, автоматически пробуем Gemini 2.0 или 1.5
            if (data.error.message.includes("not found") || data.error.message.includes("quota")) {
                console.log("🔄 Откат на стабильную модель...");
                return askFallback(text, image, history); 
            }
            return `Ошибка ИИ: ${data.error.message}`;
        }

        if (data.candidates && data.candidates[0].content) {
            return data.candidates[0].content.parts[0].text;
        }
        return "ИИ не смог ответить.";

    } catch (e) {
        console.error("❌ Critical Error:", e.message);
        return "Ошибка соединения с Google 3 API.";
    }
}

// Резервная функция на случай, если Gemini 3 Pro еще не активна для твоего ключа
async function askFallback(text, image, history) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;
    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: text }] }] })
    });
    const data = await response.json();
    return data.candidates ? data.candidates[0].content.parts[0].text : "Ошибка всех моделей.";
}
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



