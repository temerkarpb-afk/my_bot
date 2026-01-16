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
const GROQ_KEY = "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";
const TG_TOKEN = "8538917490:AAF1DQ7oVWHlR9EuodCq8QNbDEBlB_MX9Ac";
const ADMIN_ID = "6884407224";

const bot = new Telegraf(TG_TOKEN);
bot.use(session());

// --- НОВЫЙ МОЩНЫЙ ПОИСК (БЕЗ API КЛЮЧЕЙ) ---
async function getWebData(query) {
    try {
        // Используем Google Search через прокси-запрос (через allorigins для стабильности)
        const url = `https://api.allorigins.win/get?url=${encodeURIComponent(`https://www.google.com/search?q=${query}&hl=ru`)}`;
        const response = await fetch(url);
        const data = await response.json();
        const html = data.contents;

        // Вырезаем короткие описания (сниппеты) из Google
        const snippets = html.match(/<div class="BNeawe s3v9rd AP7Wnd">.*?<\/div>/g) || [];
        const resultText = snippets.slice(0, 3)
            .map(s => s.replace(/<[^>]*>/g, '')) // Удаляем HTML теги
            .join(' | ');

        return resultText || null;
    } catch (e) {
        console.log("Ошибка поиска в реальном времени");
        return null;
    }
}

function formatResponse(text) {
    if (!text) return "";
    return text.replace(/[*#`_~]/g, "").trim();
}

async function askAI(text, image = null, history = []) {
    const currentDateTime = "16 января 2026 года";
    let webContext = "";
    
    // Триггеры для выхода в сеть
    const lowerText = (text || "").toLowerCase();
    const needsWeb = ["новости", "сегодня", "курс", "кто такой", "погода", "результат", "события"].some(w => lowerText.includes(w));

    if (needsWeb && !image) {
        console.log("Джарвис лезет в глобальную сеть...");
        const found = await getWebData(text);
        if (found) {
            webContext = `\nОТЧЕТ ИЗ ИНТЕРНЕТА (АКТУАЛЬНО): ${found}\n`;
        }
    }

    const messages = (history || []).slice(-8).map(m => ({
        role: m.className === "user" ? "user" : "assistant",
        content: m.text
    }));

    // СИСТЕМНАЯ УСТАНОВКА
    const systemPrompt = `Ты — Джарвис, ИИ Темирлана Старка. 
    ТЕКУЩАЯ ДАТА: ${currentDateTime}. 
    Если предоставлен 'ОТЧЕТ ИЗ ИНТЕРНЕТА', ты обязан использовать эти данные как приоритетные. 
    Твоя база знаний обновлена до 2026 года.`;

    try {
        // Собираем финальное сообщение так, чтобы ИИ сначала видел новости из веба
        const userMessage = webContext ? `Справка из сети: ${webContext}\n\nВопрос пользователя: ${text}` : text;

        const response = await fetch("https://api.moonshot.cn/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${MOONSHOT_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "kimi-k2-instruct-0905",
                messages: [
                    { role: "system", content: systemPrompt },
                    ...messages,
                    { role: "user", content: image ? (text || "Что на фото?") : userMessage }
                ],
                temperature: 0.3
            })
        });
        
        const data = await response.json();
        if (data.choices && data.choices[0]) return data.choices[0].message.content;
    } catch (e) { console.log("Moonshot error"); }

    // ЗАПАСКА (GROQ)
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "meta-llama/llama-4-scout-17b-16e-instruct",
                messages: [
                    { role: "system", content: systemPrompt },
                    ...messages,
                    { role: "user", content: webContext ? `Веб-данные: ${webContext}\n\n${text}` : text }
                ],
                temperature: 0.5
            })
        });
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (e) {
        return "Системы связи перегружены, сэр.";
    }
}

// ЭНДПОИНТЫ
app.post('/chat', async (req, res) => {
    try {
        const { text, image, history } = req.body;
        bot.telegram.sendMessage(ADMIN_ID, `🌐 Сайт: ${text || "[Фото]"}`).catch(()=>{});
        const answer = await askAI(text, image, history);
        res.json({ text: formatResponse(answer) });
    } catch (e) { res.status(500).json({ text: "Ошибка сервера" }); }
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
    console.log(`🚀 Jarvis Online v2026.1`);
    bot.launch().catch(() => {});
});
