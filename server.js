const express = require('express');
const cors = require('cors');
const path = require('path');
const { Telegraf, session } = require('telegraf');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname))); 

// ВСЕ ТВОИ КЛЮЧИ
const MOONSHOT_KEY = "sk-apabbB7cauCvMQeLDfrKm1wZNc6Cw8UAW416iTiGOtXR3VUa";
const GROQ_KEY = "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";
const TG_TOKEN = "8538917490:AAF1DQ7oVWHlR9EuodCq8QNbDEBlB_MX9Ac";
const ADMIN_ID = "6884407224";

const bot = new Telegraf(TG_TOKEN);
bot.use(session());

function formatResponse(text) {
    if (!text) return "";
    return text.replace(/[*#`_~]/g, "").trim();
}

async function askAI(text, image = null, history = []) {
    const messages = (history || []).slice(-8).map(m => ({
        role: m.className === "user" ? "user" : "assistant",
        content: m.text
    }));

    try {
        let userContent;
        if (image) {
            // МАКСИМАЛЬНО ЯВНЫЙ ФОРМАТ ДЛЯ VISION
            userContent = [
                { 
                    type: "text", 
                    text: text || "Пожалуйста, посмотри на это изображение и опиши, что ты видишь." 
                },
                { 
                    type: "image_url", 
                    image_url: { url: `data:image/jpeg;base64,${image}` } 
                }
            ];
        } else {
            userContent = text || "Привет";
        }

        const response = await fetch("https://api.moonshot.cn/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${MOONSHOT_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "kimi-k2-instruct-0905",
                messages: [
                    { 
                        role: "system", 
                        content: "Ты CyberBot v3.0. Твой создатель Темирлан. ТЫ ОБЛАДАЕШЬ ЗРЕНИЕМ и можешь анализировать изображения, которые присылает пользователь." 
                    }, 
                    ...messages, 
                    { role: "user", content: userContent }
                ],
                temperature: 0.3
            })
        });
        
        const data = await response.json();
        if (data.choices && data.choices[0]) return data.choices[0].message.content;
    } catch (e) {
        console.log("Ошибка основной модели...");
    }

    // ЗАПАСКА (Оставляем твою модель Groq без изменений)
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "meta-llama/llama-4-scout-17b-16e-instruct",
                messages: [
                    { role: "system", content: "Ты чат-бот по имени Джарвис Твой создатель Темирлан Старк." }, 
                    ...messages, 
                    { role: "user", content: text || "Привет" }
                ],
                temperature: 0.6
            })
        });
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (e) {
        return "Ошибка всех нейросетей.";
    }
}
// ЭНДПОИНТ ДЛЯ САЙТА
app.post('/chat', async (req, res) => {
    try {
        const { text, image, history } = req.body;
        
        // Уведомление админу в ТГ (Сайт)
        bot.telegram.sendMessage(ADMIN_ID, `🌐 Сайт: ${text || "[Фото]"}`).catch(()=>{});
        
        const answer = await askAI(text, image, history);
        res.json({ text: formatResponse(answer) });
    } catch (e) {
        res.status(500).json({ text: "Ошибка сервера" });
    }
});

// ЛОГИКА ТЕЛЕГРАМ БОТА
bot.on('text', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) {
        bot.telegram.sendMessage(ADMIN_ID, `🔔 ТГ от @${ctx.from.username}: ${ctx.message.text}`).catch(()=>{});
    }
    const answer = await askAI(ctx.message.text);
    ctx.reply(formatResponse(answer));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
    bot.launch().catch(() => {});
});

