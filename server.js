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

// --- СТАБИЛЬНЫЙ ПОИСК (СПОСОБ №4: GOOGLE SEARCH SNIPPETS) ---
async function getWebData(query) {
    try {
        // Используем сервис получения текста с поисковых страниц без блокировок
        const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(`https://www.google.com/search?q=${query}&hl=ru`)}`);
        const data = await response.json();
        const html = data.contents;
        
        // Извлекаем текстовые блоки (сниппеты) из выдачи Google
        const searchResults = html.match(/<div class="BNeawe s3v9rd AP7Wnd">.*?<\/div>/g) || [];
        const cleanInfo = searchResults.slice(0, 3)
            .map(s => s.replace(/<[^>]*>/g, ''))
            .join(' | ');
            
        return cleanInfo || null;
    } catch (e) {
        return null;
    }
}

function formatResponse(text) {
    if (!text) return "";
    return text.replace(/[*#`_~]/g, "").trim();
}

async function askAI(text, image = null, history = []) {
    const now = new Date();
    const currentDateTime = now.toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' });

    let internetContext = "";
    const lowerText = (text || "").toLowerCase();
    
    // Активируем поиск только при реальной необходимости
    const searchWords = ["новости", "кто сейчас", "курс", "сегодня", "президент", "погода", "результат", "цена"];
    const needsSearch = searchWords.some(w => lowerText.includes(w));

    if (needsSearch && !image) {
        console.log("Джарвис делает глубокий поиск...");
        const rawData = await getWebData(text);
        if (rawData) {
            internetContext = `\n[РЕЗУЛЬТАТЫ ПОИСКА В ГУГЛ НА ${currentDateTime}]: ${rawData}\n`;
        } else {
            internetContext = `\n[ВНИМАНИЕ]: Поиск в сети не дал результатов. Отвечай только на основе своих знаний, не выдумывай текущие события.\n`;
        }
    }

    const messages = (history || []).slice(-8).map(m => ({
        role: m.className === "user" ? "user" : "assistant",
        content: m.text
    }));

    const systemInstruction = `Ты — Джарвис, ИИ Темирлана Старка. 
    ТЕКУЩАЯ ДАТА: ${currentDateTime}. 
    Если предоставлены 'РЕЗУЛЬТАТЫ ПОИСКА', используй их. 
    Если информации нет, НЕ ВЫДУМЫВАЙ новости (особенно про COVID или Байдена). 
    Будь точным и лаконичным.`;

    // --- 1. MOONSHOT (KIMI) ---
    try {
        let userContent = image ? [
            { type: "text", text: text || "Что на фото?" },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } }
        ] : (internetContext + (text || "Привет"));

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
        console.log("Kimi Mode Off");
    }

    // --- 2. GROQ ЗАПАСКА ---
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "meta-llama/llama-4-scout-17b-16e-instruct",
                messages: [
                    { role: "system", content: systemInstruction + " Ты ВИДИШЬ картинки." }, 
                    ...messages, 
                    { role: "user", content: (internetContext + (text || "Привет")) }
                ],
                temperature: 0.6
            })
        });
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (e) {
        return "Сэр, зафиксирован сбой в глобальной сети. Попробуйте позже.";
    }
}

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
    console.log(`🚀 Jarvis Online | DeepSearch v4 Active`);
    bot.launch().catch(() => {});
});
