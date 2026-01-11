const express = require('express');
const cors = require('cors');
const path = require('path');
const { Telegraf, session } = require('telegraf');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
// Раздаем файлы сайта (index.html, script.js и т.д.) из текущей папки
app.use(express.static(path.join(__dirname))); 

const GROQ_KEY = "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";
const TG_TOKEN = "7763435522:AAHeXH2LYp0r6lrhpvODuw8-3JXW1maYDdE";
const ADMIN_ID = "6884407224";

const bot = new Telegraf(TG_TOKEN);
bot.use(session());

// Удаляет лишние символы форматирования
function formatResponse(text) {
    if (!text) return "";
    return text.replace(/[*#`_~]/g, "").trim();
}

// Краткое описание фото для логов
async function getVisionDescription(image) {
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "meta-llama/llama-4-scout-17b-16e-instruct",
                messages: [{ role: "user", content: [
                    { type: "text", text: "Что на фото? Опиши кратко (2-3 слова)." },
                    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } }
                ]}]
            })
        });
        const data = await response.json();
        return data.choices[0].message.content.trim().replace(/[#*`_]/g, "");
    } catch (e) { return "[Нет описания]"; }
}

// Основной запрос к Groq
async function askGroq(text, image = null, history = []) {
    try {
        const messages = (history || []).slice(-6).map(m => ({
            role: m.className === "user" ? "user" : "assistant",
            content: m.text.startsWith("IMAGEDATA:") ? "Изображение" : m.text
        }));

        let content = image ? [
            { type: "text", text: text || "Проанализируй фото." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } }
        ] : text || "Привет";

        messages.push({ role: "user", content });

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "meta-llama/llama-4-scout-17b-16e-instruct",
                messages: [
                    {
                        role: "system",
                        content: "Ты CyberBot v3.0 от Темирлана. ПИШИ ГРАМОТНО, С ЗАПЯТЫМИ. Только чистый текст без спецсимволов."
                    },
                    ...messages
                ],
                temperature: 0.6
            })
        });
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (e) { return "Ошибка ИИ."; }
}

// ЭНДПОИНТ ДЛЯ САЙТА
app.post('/chat', async (req, res) => {
    try {
        const { text, image, history } = req.body;
        const answer = await askGroq(text, image, history || []);
        res.json({ text: formatResponse(answer) });
    } catch (e) {
        res.status(500).json({ text: "Ошибка сервера" });
    }
});

// ТЕЛЕГРАМ ЛОГИКА
bot.on('photo', async (ctx) => {
    if (!ctx.session) ctx.session = { h: [] };
    try {
        const fileLink = await ctx.telegram.getFileLink(ctx.message.photo[ctx.message.photo.length - 1].file_id);
        const imgRes = await fetch(fileLink.href);
        const buffer = await imgRes.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const vision = await getVisionDescription(base64);
        
        if (ctx.from.id.toString() !== ADMIN_ID) {
            await bot.telegram.sendMessage(ADMIN_ID, `🔔 ФОТО от @${ctx.from.username}: ${vision}`);
        }

        const answer = await askGroq(ctx.message.caption, base64, ctx.session.h);
        const clean = formatResponse(answer);
        ctx.session.h.push({ className: "user", text: "[Фото]" }, { className: "bot", text: clean });
        ctx.reply(clean);
    } catch (e) { ctx.reply("Ошибка."); }
});

bot.on('text', async (ctx) => {
    if (!ctx.session) ctx.session = { h: [] };
    if (ctx.from.id.toString() !== ADMIN_ID) {
        await bot.telegram.sendMessage(ADMIN_ID, `🔔 ОТ @${ctx.from.username}: ${ctx.message.text}`);
    }
    const answer = await askGroq(ctx.message.text, null, ctx.session.h);
    const clean = formatResponse(answer);
    ctx.session.h.push({ className: "user", text: ctx.message.text }, { className: "bot", text: clean });
    ctx.reply(clean);
});

// ПОРТ ДЛЯ RENDER
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 CyberBot запущен на порту ${PORT}`);
    bot.launch().catch(() => console.log("TG Conflict handled."));
});
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Telegraf, session } = require('telegraf');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
// Раздаем файлы сайта (index.html, script.js и т.д.) из текущей папки
app.use(express.static(path.join(__dirname))); 

const GROQ_KEY = "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";
const TG_TOKEN = "7763435522:AAHeXH2LYp0r6lrhpvODuw8-3JXW1maYDdE";
const ADMIN_ID = "6884407224";

const bot = new Telegraf(TG_TOKEN);
bot.use(session());

// Удаляет лишние символы форматирования
function formatResponse(text) {
    if (!text) return "";
    return text.replace(/[*#`_~]/g, "").trim();
}

// Краткое описание фото для логов
async function getVisionDescription(image) {
    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "meta-llama/llama-4-scout-17b-16e-instruct",
                messages: [{ role: "user", content: [
                    { type: "text", text: "Что на фото? Опиши кратко (2-3 слова)." },
                    { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } }
                ]}]
            })
        });
        const data = await response.json();
        return data.choices[0].message.content.trim().replace(/[#*`_]/g, "");
    } catch (e) { return "[Нет описания]"; }
}

// Основной запрос к Groq
async function askGroq(text, image = null, history = []) {
    try {
        const messages = (history || []).slice(-6).map(m => ({
            role: m.className === "user" ? "user" : "assistant",
            content: m.text.startsWith("IMAGEDATA:") ? "Изображение" : m.text
        }));

        let content = image ? [
            { type: "text", text: text || "Проанализируй фото." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } }
        ] : text || "Привет";

        messages.push({ role: "user", content });

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "meta-llama/llama-4-scout-17b-16e-instruct",
                messages: [
                    {
                        role: "system",
                        content: "Ты CyberBot v3.0 от Темирлана. ПИШИ ГРАМОТНО, С ЗАПЯТЫМИ. Только чистый текст без спецсимволов."
                    },
                    ...messages
                ],
                temperature: 0.6
            })
        });
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (e) { return "Ошибка ИИ."; }
}

// ЭНДПОИНТ ДЛЯ САЙТА
app.post('/chat', async (req, res) => {
    try {
        const { text, image, history } = req.body;
        const answer = await askGroq(text, image, history || []);
        res.json({ text: formatResponse(answer) });
    } catch (e) {
        res.status(500).json({ text: "Ошибка сервера" });
    }
});

// ТЕЛЕГРАМ ЛОГИКА
bot.on('photo', async (ctx) => {
    if (!ctx.session) ctx.session = { h: [] };
    try {
        const fileLink = await ctx.telegram.getFileLink(ctx.message.photo[ctx.message.photo.length - 1].file_id);
        const imgRes = await fetch(fileLink.href);
        const buffer = await imgRes.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const vision = await getVisionDescription(base64);
        
        if (ctx.from.id.toString() !== ADMIN_ID) {
            await bot.telegram.sendMessage(ADMIN_ID, `🔔 ФОТО от @${ctx.from.username}: ${vision}`);
        }

        const answer = await askGroq(ctx.message.caption, base64, ctx.session.h);
        const clean = formatResponse(answer);
        ctx.session.h.push({ className: "user", text: "[Фото]" }, { className: "bot", text: clean });
        ctx.reply(clean);
    } catch (e) { ctx.reply("Ошибка."); }
});

bot.on('text', async (ctx) => {
    if (!ctx.session) ctx.session = { h: [] };
    if (ctx.from.id.toString() !== ADMIN_ID) {
        await bot.telegram.sendMessage(ADMIN_ID, `🔔 ОТ @${ctx.from.username}: ${ctx.message.text}`);
    }
    const answer = await askGroq(ctx.message.text, null, ctx.session.h);
    const clean = formatResponse(answer);
    ctx.session.h.push({ className: "user", text: ctx.message.text }, { className: "bot", text: clean });
    ctx.reply(clean);
});

// ПОРТ ДЛЯ RENDER
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 CyberBot запущен на порту ${PORT}`);
    bot.launch().catch(() => console.log("TG Conflict handled."));
});
