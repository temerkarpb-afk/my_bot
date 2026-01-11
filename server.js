const express = require('express');
const cors = require('cors');
const path = require('path');
const { Telegraf, session } = require('telegraf');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' }));

// Переменные окружения
const GEMINI_KEY = process.env.GEMINI_KEY || "AIzaSyBGoV90et0rZPNvoru7b86PNgl0EuiiCUY"; 
const TG_TOKEN = process.env.TG_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID; // ВЕРНУЛ ADMIN_ID

const bot = new Telegraf(TG_TOKEN);
bot.use(session());

app.use(express.static(path.join(__dirname)));

async function askGemini(text, image = null, history = []) {
    try {
        const contents = (history || []).slice(-6).map(m => ({
            role: m.className === "user" ? "user" : "model",
            parts: [{ text: m.text || "" }]
        }));

        let currentContent = { role: "user", parts: [] };
        
        if (image) {
            currentContent.parts.push({
                inline_data: {
                    mime_type: "image/jpeg",
                    data: image
                }
            });
            currentContent.parts.push({ text: text || "Проанализируй это фото." });
        } else {
            currentContent.parts.push({ text: text || "Привет" });
        }

        contents.push(currentContent);

        const systemInstruction = "Твой создатель Темирлан. Ты — продвинутый CyberBot v2.0. Ты обладаешь актуальными знаниями о медийных личностях (Арсен Маркарян, Вито Бассо, Шон О Прай). Отвечай грамотно, ставь запятые, не используй символы * # _. Только чистый текст.";

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: contents,
                system_instruction: { parts: [{ text: systemInstruction }] },
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 1000,
                }
            })
        });

        const data = await response.json();
        
        if (data.error) {
            console.error("Gemini API Error:", data.error);
            return "Ошибка ИИ. Попробуй позже.";
        }

        return data.candidates[0].content.parts[0].text;
    } catch (e) {
        console.error("Gemini Logic Error:", e);
        return "Ошибка соединения с Google.";
    }
}

app.get('/', (req, res) => res.send('CyberBot is Live with ADMIN_ID check!'));

// Добавил логирование сообщения админу в консоль
bot.on('text', async (ctx) => {
    try {
        if (!ctx.session) ctx.session = { h: [] };
        
        // Пример использования ADMIN_ID: логировать запросы от владельца отдельно
        if (ctx.from.id.toString() === ADMIN_ID) {
            console.log(`Админ ${ADMIN_ID} прислал сообщение: ${ctx.message.text}`);
        }

        const answer = await askGemini(ctx.message.text, null, ctx.session.h);
        const cleanAnswer = answer.replace(/[*#`_~]/g, "").trim();
        
        ctx.reply(cleanAnswer);
        
        ctx.session.h.push({ className: "user", text: ctx.message.text });
        ctx.session.h.push({ className: "assistant", text: cleanAnswer });
    } catch (e) { console.log("TG Text Error:", e); }
});

app.post('/chat', async (req, res) => {
    try {
        const { text, image, history } = req.body;
        const cleanImage = image ? image.replace(/^data:image\/\w+;base64,/, "") : null;
        const answer = await askGemini(text, cleanImage, history);
        res.json({ text: answer.replace(/[*#`_~]/g, "").trim() });
    } catch (e) {
        res.status(500).json({ text: "Ошибка сервера" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен. Админ ID: ${ADMIN_ID || 'не задан'}`);
    bot.launch().catch(err => console.error("TG Start Error:", err));
});
