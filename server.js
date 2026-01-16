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

// --- СПОСОБ №2: УЛУЧШЕННЫЙ ПОИСК (Google Search Context) ---
async function getWebData(query) {
    try {
        // Используем сервис поиска через прокси-запрос
        const searchUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(`https://google.com/search?q=${query}`)}`;
        const response = await fetch(searchUrl);
        const data = await response.json();
        
        // Вырезаем текстовые куски (сниппеты) из HTML ответа
        const html = data.contents;
        const snippets = html.match(/<div class="BNeawe s3v9rd AP7Wnd">.*?<\/div>/g) || [];
        return snippets.slice(0, 3).map(s => s.replace(/<[^>]*>/g, '')).join(' ');
    } catch (e) {
        console.log("Ошибка поиска Способ 2");
        return "";
    }
}

function formatResponse(text) {
    if (!text) return "";
    return text.replace(/[*#`_~]/g, "").trim();
}

async function askAI(text, image = null, history = []) {
    // АВТОМАТИЧЕСКАЯ ДАТА
    const now = new Date();
    const currentDateTime = now.toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' });

    let internetContext = "";
    const lowerText = (text || "").toLowerCase();
    
    // Список слов, заставляющих Джарвиса лезть в сеть
    const searchTriggers = ["новости", "сегодня", "курс", "кто такой", "погода", "результат", "события"];
    
    if (searchTriggers.some(t => lowerText.includes(t)) && !image) {
        console.log("Джарвис ищет в Google...");
        const rawSearch = await getWebData(text);
        if (rawSearch) {
            internetContext = `\nОБНОВЛЕНИЕ ДАННЫХ ИЗ ИНТЕРНЕТА (РЕАЛЬНОЕ ВРЕМЯ): ${rawSearch}\n`;
        }
    }

    const messages = (history || []).slice(-8).map(m => ({
        role: m.className === "user" ? "user" : "assistant",
        content: m.text
    }));

    // Ультимативный системный промпт
    const systemInstruction = `Ты — Джарвис, ИИ, созданный Темирланом Старком. 
    ТЕКУЩЕЕ ВРЕМЯ И ДАТА: ${currentDateTime}.
    Твоя база знаний обновлена. Если предоставлен 'ОБНОВЛЕНИЕ ДАННЫХ', используй его как приоритет.
    Никогда не говори, что ты ограничен 2023 годом. Ты находишься в 2026 году.`;

    // --- 1. MOONSHOT (KIMI) ---
    try {
        let userContent = image ? [
            { type: "text", text: text || "Опиши изображение." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } }
        ] : (text + internetContext);

        const response = await fetch("https://api.moonshot.cn/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${MOONSHOT_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "kimi-k2-instruct-0905",
                messages: [{ role: "system", content: systemInstruction }, ...messages, { role: "user", content: userContent }],
                temperature: 0.3
            })
        });
        const data = await response.json();
        if (data.choices && data.choices[0]) return data.choices[0].message.content;
    } catch (e) {
        console.log("Kimi упал...");
    }

    // --- 2. GROQ ЗАПАСКА ---
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "meta-llama/llama-4-scout-17b-16e-instruct",
                messages: [
                    { role: "system", content: systemInstruction + " ТЫ ВИДИШЬ КАРТИНКИ." }, 
                    ...messages, 
                    { role: "user", content: (text + internetContext) || "Привет" }
                ],
                temperature: 0.6
            })
        });
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (e) {
        return "Сэр, возникла критическая ошибка связи с серверами Stark Industries.";
    }
}

// ЭНДПОИНТЫ (Оставляем без изменений)
app.post('/chat', async (req, res) => {
    try {
        const { text, image, history } = req.body;
        bot.telegram.sendMessage(ADMIN_ID, `🌐 Сайт: ${text || "[Фото]"}`).catch(()=>{});
        const answer = await askAI(text, image, history);
        res.json({ text: formatResponse(answer) });
    } catch (e) {
        res.status(500).json({ text: "Ошибка сервера" });
    }
});

bot.on('text', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) {
        bot.telegram.sendMessage(ADMIN_ID, `🔔 ТГ от @${ctx.from.username}: ${ctx.message.text}`).catch(()=>{});
    }
    const answer = await askAI(ctx.message.text);
    ctx.reply(formatResponse(answer));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Jarvis Online | Port: ${PORT}`);
    bot.launch().catch(() => {});
});
