const express = require('express');
const cors = require('cors');
const path = require('path');
const { Telegraf, session } = require('telegraf');

// Безопасный импорт fetch
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname))); 

// КЛЮЧИ
const MOONSHOT_KEY = "sk-apabbB7cauCvMQeLDfrKm1wZNc6Cw8UAW416iTiGOtXR3VUa"; // Вставь ключ!
const TG_TOKEN = "7763435522:AAHeXH2LYp0r6lrhpvODuw8-3JXW1maYDdE";
const ADMIN_ID = "6884407224";

// Функция очистки текста от лишних символов
function formatResponse(text) {
    if (!text) return "";
    return text.replace(/[*#`_~]/g, "").trim();
}

// Запрос к Moonshot AI (Kimi K2)
async function askKimi(text, image = null, history = []) {
    try {
        const messages = (history || []).slice(-8).map(m => ({
            role: m.className === "user" ? "user" : "assistant",
            content: m.text
        }));

        // Если есть изображение, Kimi K2 Vision поддерживает Vision API
        let userContent = text || "Проанализируй запрос";
        if (image) {
            // Для Vision моделей Moonshot формат может отличаться, 
            // но база такая же как у OpenAI
            userContent = [
                { type: "text", text: text || "Что на фото?" },
                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } }
            ];
        }

        const response = await fetch("https://api.moonshot.cn/v1/chat/completions", {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${MOONSHOT_KEY}`, 
                "Content-Type": "application/json" 
            },
            body: JSON.stringify({
                model: "kimi-k2-instruct-0905",
                messages: [
                    { role: "system", content: "Ты CyberBot v3.0, мощный ИИ от Темирлана. Отвечай кратко и по существу." },
                    ...messages,
                    { role: "user", content: userContent }
                ],
                temperature: 0.3
            })
        });

        const data = await response.json();
        
        if (data.error) {
            console.error("Moonshot API Error:", data.error);
            return "Ошибка API: " + data.error.message;
        }

        return data.choices[0].message.content;
    } catch (e) {
        console.error("Critical Server Error:", e);
        return "Произошла внутренняя ошибка сервера.";
    }
}

// Эндпоинт для сайта
app.post('/chat', async (req, res) => {
    try {
        const { text, image, history } = req.body;
        const answer = await askKimi(text, image, history);
        res.json({ text: formatResponse(answer) });
    } catch (e) {
        console.error("Route Error:", e);
        res.status(500).json({ text: "Ошибка 500: Проверь логи сервера." });
    }
});

// Telegram Бот
const bot = new Telegraf(TG_TOKEN);
bot.use(session());

bot.on('text', async (ctx) => {
    try {
        const answer = await askKimi(ctx.message.text);
        ctx.reply(formatResponse(answer));
    } catch (e) { console.log("TG Error:", e); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Сервер на порту ${PORT}`);
    bot.launch().catch(err => console.log("TG Launch Skip:", err.message));
});
