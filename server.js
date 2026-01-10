const express = require('express');
const cors = require('cors');
const path = require('path');
const { Telegraf, session } = require('telegraf');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

// Используем переменные окружения из настроек Render
const GROQ_KEY = process.env.GROQ_KEY;
const TG_TOKEN = process.env.TG_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;

const bot = new Telegraf(TG_TOKEN);
bot.use(session());

// Раздача фронтенда (HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

async function askGroq(text, image = null, history = []) {
    try {
        const messages = (history || []).slice(-6).map(m => ({
            role: m.className === "user" ? "user" : "assistant",
            content: m.text?.startsWith("[Фото]") ? "Изображение" : (m.text || "")
        }));

        let content = image ? [
            { type: "text", text: text || "Проанализируй это фото." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } }
        ] : (text || "Привет");

        messages.push({ role: "user", content });

                const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                // Если есть фото — vision модель, если только текст — мощная 70B модель
                model: image ? "llama-3.2-11b-vision-preview" : "llama-3.3-70b-versatile",
                messages: [
                    { 
                        role: "system", 
                        content: "Ты — продвинутый CyberBot v2.0. Ты знаешь всё о медийных личностях . Отвечай грамотно, ставь запятые, не используй символы * # _. Только чистый текст." 
                    },
                    ...messages
                ],
                temperature: 0.5
            })
        });

        const data = await response.json();
        if (!data.choices || !data.choices[0]) return "Ошибка ИИ: Проверь GROQ_KEY.";
        return data.choices[0].message.content;
    } catch (e) {
        console.error("Groq Error:", e);
        return "Произошла ошибка при запросе к нейросети.";
    }
}

app.get('/', (req, res) => res.send('CyberBot is Live!'));

app.post('/chat', async (req, res) => {
    try {
        const { text, image, history } = req.body;
        const answer = await askGroq(text, image, history);
        res.json({ text: answer.replace(/[*#`_~]/g, "").trim() });
    } catch (e) {
        res.status(500).json({ text: "Ошибка сервера" });
    }
});

bot.on('text', async (ctx) => {
    try {
        const answer = await askGroq(ctx.message.text, null, ctx.session?.h || []);
        ctx.reply(answer.replace(/[*#`_~]/g, "").trim());
    } catch (e) { console.log("TG Text Error:", e); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    bot.launch().catch(err => console.error("TG Start Error:", err));
});



