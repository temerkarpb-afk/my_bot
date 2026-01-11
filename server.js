const express = require('express');
const cors = require('cors');
const path = require('path');
const { Telegraf, session } = require('telegraf');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname))); 

// ТВОЙ КЛЮЧ (убедись, что аккаунт Moonshot пополнен)
const MOONSHOT_KEY = "sk-apabbB7cauCvMQeLDfrKm1wZNc6Cw8UAW416iTiGOtXR3VUa".trim();
const TG_TOKEN = "7763435522:AAHeXH2LYp0r6lrhpvODuw8-3JXW1maYDdE";
const ADMIN_ID = "6884407224";

async function askKimi(text, image = null, history = []) {
    try {
        const messages = (history || []).slice(-10).map(m => ({
            role: m.className === "user" ? "user" : "assistant",
            content: m.text.startsWith("IMAGEDATA:") ? "Изображение" : m.text
        }));

        let userContent = image ? [
            { type: "text", text: text || "Что на фото?" },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } }
        ] : text || "Привет";

        const response = await fetch("https://api.moonshot.cn/v1/chat/completions", {
            method: "POST",
            headers: { 
                "Authorization": `Bearer ${MOONSHOT_KEY}`, 
                "Content-Type": "application/json" 
            },
            body: JSON.stringify({
                model: "kimi-k2-instruct-0905",
                messages: [
                    { role: "system", content: "Ты CyberBot v3.0 от Темирлана. Пиши чисто, без символов * # _." },
                    ...messages,
                    { role: "user", content: userContent }
                ],
                temperature: 0.3
            })
        });

        const data = await response.json();
        
        // Если ошибка — выводим её в консоль Render для отладки
        if (data.error) {
            console.error("Moonshot Error Detail:", data.error);
            return `Ошибка API: ${data.error.message} (Код: ${data.error.code})`;
        }

        return data.choices[0].message.content;
    } catch (e) {
        return "Ошибка: Не удалось связаться с Moonshot AI.";
    }
}

app.post('/chat', async (req, res) => {
    const { text, image, history } = req.body;
    const answer = await askKimi(text, image, history);
    res.json({ text: answer });
});

const bot = new Telegraf(TG_TOKEN);
bot.use(session());
bot.on('text', async (ctx) => {
    const answer = await askKimi(ctx.message.text);
    ctx.reply(answer);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 CyberBot v3.0 онлайн`);
    bot.launch().catch(() => {});
});
