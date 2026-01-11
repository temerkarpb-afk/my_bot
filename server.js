const express = require('express');

const cors = require('cors');

const fs = require('fs');

const { Telegraf, session } = require('telegraf');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));



const app = express();

app.use(cors());

app.use(express.json({ limit: '15mb' }));



const GROQ_KEY = "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";

const TG_TOKEN = "7763435522:AAHeXH2LYp0r6lrhpvODuw8-3JXW1maYDdE";

const ADMIN_ID = "6884407224";



const bot = new Telegraf(TG_TOKEN);

bot.use(session());



// Форматирование текста: УДАЛЯЕТ ТОЛЬКО СИМВОЛЫ МАРКДАУНА, ЗАПЯТЫЕ ОСТАЮТСЯ

function formatResponse(text) {

    if (!text) return "";

    return text.replace(/[*#`_~]/g, "").trim();

}



// Описание фото для админа (терминал)

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



// Основная функция запроса к ИИ

async function askGroq(text, image = null, history = []) {

    const messages = history.slice(-6).map(m => ({

        role: m.className === "user" ? "user" : "assistant",

        content: m.text.startsWith("[Фото]") ? "Изображение" : m.text

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

                    content: "Ты CyberBot v2.0 от Темирлана. ПИШИ ГРАМОТНО, ОБЯЗАТЕЛЬНО СТАВЬ ЗАПЯТЫЕ И ТОЧКИ. Не используй символы * # _ `. Только чистый человеческий текст."

                },

                ...messages

            ],

            temperature: 0.6

        })

    });

    const data = await response.json();

    return data.choices[0].message.content;

}



// --- ЛОГИКА ВЕБ-САЙТА (ТОЛЬКО ТЕРМИНАЛ) ---

app.post('/chat', async (req, res) => {

    try {

        const { text, image, history } = req.body;

       

        let visionInfo = image ? await getVisionDescription(image) : "";



        // Вывод строго в терминал

        console.log(`\n🌐 [WEB ЗАПРОС] --- ${new Date().toLocaleTimeString()}`);

        if (image) console.log(`👁 НА ФОТО (WEB): ${visionInfo}`);

        console.log(`💬 ТЕКСТ (WEB): ${text || "[Пусто]"}`);

        console.log(`---------------------------\n`);



        const answer = await askGroq(text, image, history || []);

        res.json({ text: formatResponse(answer) });

    } catch (e) {

        console.error("Web Error:", e);

        res.status(500).json({ text: "Ошибка сервера" });

    }

});



// --- ЛОГИКА TELEGRAM (ТЕРМИНАЛ + УВЕДОМЛЕНИЕ В ТГ) ---

bot.on('photo', async (ctx) => {

    if (!ctx.session) ctx.session = { h: [] };

    try {

        const fileLink = await ctx.telegram.getFileLink(ctx.message.photo[ctx.message.photo.length - 1].file_id);

        const imgRes = await fetch(fileLink.href);

        const buffer = await imgRes.arrayBuffer();

        const base64 = Buffer.from(buffer).toString('base64');

       

        const visionInfo = await getVisionDescription(base64);

        const user = `@${ctx.from.username || ctx.from.id}`;



        // В терминал

        console.log(`\n📱 [TG ФОТО] от ${user}`);

        console.log(`👁 НА ФОТО: ${visionInfo}`);



        // Уведомление тебе в ТГ (если пишет не админ)

        if (ctx.from.id.toString() !== ADMIN_ID) {

            await bot.telegram.sendMessage(ADMIN_ID, `🔔 TG ФОТО от ${user}\n👁 Вижу: ${visionInfo}\n💬 ${ctx.message.caption || ""}`);

        }



        const answer = await askGroq(ctx.message.caption, base64, ctx.session.h);

        const clean = formatResponse(answer);

        ctx.session.h.push({ className: "user", text: "[Фото]" }, { className: "bot", text: clean });

        ctx.reply(clean);

    } catch (e) { ctx.reply("Ошибка."); }

});



bot.on('text', async (ctx) => {

    if (!ctx.session) ctx.session = { h: [] };

    const user = `@${ctx.from.username || ctx.from.id}`;

   

    console.log(`📱 [TG ТЕКСТ] от ${user}: ${ctx.message.text}`);



    if (ctx.from.id.toString() !== ADMIN_ID) {

        await bot.telegram.sendMessage(ADMIN_ID, `🔔 TG ОТ ${user}: ${ctx.message.text}`);

    }



    const answer = await askGroq(ctx.message.text, null, ctx.session.h);

    const clean = formatResponse(answer);

    ctx.session.h.push({ className: "user", text: ctx.message.text }, { className: "bot", text: clean });

    ctx.reply(clean);

});



app.listen(3000, '0.0.0.0', () => {

    console.log(`🚀 Сервер запущен! WEB -> Терминал | TG -> ТГ + Терминал`);

    bot.launch();

});
