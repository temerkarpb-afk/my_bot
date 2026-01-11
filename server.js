const express = require('express');
const cors = require('cors');
const path = require('path');
const { Telegraf, session } = require('telegraf');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname))); 

// ТВОИ КЛЮЧИ
const MOONSHOT_KEY = "sk-apabbB7cauCvMQeLDfrKm1wZNc6Cw8UAW416iTiGOtXR3VUa";
const TG_TOKEN = "7763435522:AAHeXH2LYp0r6lrhpvODuw8-3JXW1maYDdE";
const ADMIN_ID = "6884407224";

function formatResponse(text) {
    if (!text) return "";
    return text.replace(/[*#`_~]/g, "").trim();
}

async function askKimi(text, image = null, history = []) {
    try {
        const messages = (history || []).slice(-8).map(m => ({
            role: m.className === "user" ? "user" : "assistant",
            content: m.text.startsWith("IMAGEDATA:") ? "Изображение" : m.text
        }));

        let userContent;
        if (image) {
            // Формат Vision для Kimi
            userContent = [
                { type: "text", text: text || "Что на этом фото?" },
                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } }
            ];
        } else {
            userContent = text || "Привет";
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
                    { role: "system", content: "Ты CyberBot v3.0 от Темирлана. Пиши грамотно, кратко, без символов форматирования." },
                    ...messages,
                    { role: "user", content: userContent }
                ],
                temperature: 0.3
            })
        });

        const data = await response.json();
        if (data.error) return `Ошибка Kimi: ${data.error.message}`;
        return data.choices[0].message.content;
    } catch (e) {
        return "Ошибка соединения с Moonshot AI.";
    }
}

// Эндпоинт для сайта
app.post('/chat', async (req, res) => {
    try {
        const { text, image, history } = req.body;
        const answer = await askKimi(text, image, history || []);
        res.json({ text: formatResponse(answer) });
    } catch (e) {
        res.status(500).json({ text: "Ошибка сервера" });
    }
});

// Telegram логика
const bot = new Telegraf(TG_TOKEN);
bot.use(session());

bot.on('text', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) {
        await bot.telegram.sendMessage(ADMIN_ID, `🔔 TG от @${ctx.from.username}: ${ctx.message.text}`);
    }
    const answer = await askKimi(ctx.message.text);
    ctx.reply(formatResponse(answer));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 CyberBot на Kimi запущен! Порт: ${PORT}`);
    bot.launch().catch(() => {});
});
