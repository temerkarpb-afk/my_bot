const express = require('express');
const cors = require('cors');
const path = require('path');
const { Telegraf, session } = require('telegraf');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname))); 

// КЛЮЧИ
const MOONSHOT_KEY = "sk-apabbB7cauCvMQeLDfrKm1wZNc6Cw8UAW416iTiGOtXR3VUa";
const TG_TOKEN = "7763435522:AAHeXH2LYp0r6lrhpvODuw8-3JXW1maYDdE";
const ADMIN_ID = "6884407224";

const bot = new Telegraf(TG_TOKEN);
bot.use(session());

function formatResponse(text) {
    if (!text) return "";
    return text.replace(/[*#`_~]/g, "").trim();
}

async function askKimi(text, image = null, history = []) {
    try {
        const messages = (history || []).slice(-10).map(m => ({
            role: m.className === "user" ? "user" : "assistant",
            content: m.text.startsWith("IMAGEDATA:") ? "Пользователь отправил фото" : m.text
        }));

        let userContent;
        if (image) {
            userContent = [
                { type: "text", text: text || "Что на фото?" },
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
                    { role: "system", content: "Ты CyberBot v3.0 от Темирлана. Пиши грамотно, без лишних символов." },
                    ...messages,
                    { role: "user", content: userContent }
                ],
                temperature: 0.3
            })
        });

        const data = await response.json();
        if (data.error) return `Ошибка API: ${data.error.message}`;
        return data.choices[0].message.content;
    } catch (e) {
        return "Ошибка соединения с Moonshot AI.";
    }
}

// ЭНДПОИНТ ДЛЯ САЙТА
app.post('/chat', async (req, res) => {
    try {
        const { text, image, history } = req.body;
        
        // УВЕДОМЛЕНИЕ В ТГ ПРИ СООБЩЕНИИ С САЙТА
        await bot.telegram.sendMessage(ADMIN_ID, `🌐 Сообщение с САЙТА:\n${text || "[Изображение]"}`);
        
        const answer = await askKimi(text, image, history || []);
        res.json({ text: formatResponse(answer) });
    } catch (e) {
        res.status(500).json({ text: "Ошибка сервера" });
    }
});

// ЛОГИКА ТЕЛЕГРАМ БОТА
bot.on('text', async (ctx) => {
    // Если пишет не админ — пересылаем админу
    if (ctx.from.id.toString() !== ADMIN_ID) {
        await bot.telegram.sendMessage(ADMIN_ID, `🔔 Сообщение в ТГ от @${ctx.from.username || ctx.from.id}:\n${ctx.message.text}`);
    }
    const answer = await askKimi(ctx.message.text);
    ctx.reply(formatResponse(answer));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 CyberBot v3.0 запущен на порту ${PORT}`);
    bot.launch().catch(() => console.log("Бот уже запущен."));
});
