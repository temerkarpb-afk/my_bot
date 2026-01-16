const express = require('express');
const cors = require('cors');
const path = require('path');
const { Telegraf, session } = require('telegraf');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname))); 

// КЛЮЧИ (Добавь сюда ключ от Tavily)
const GROQ_KEY = "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";
const TAVILY_KEY = "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"; // Получи на tavily.com
const TG_TOKEN = "8538917490:AAF1DQ7oVWHlR9EuodCq8QNbDEBlB_MX9Ac";
const ADMIN_ID = "6884407224";

const bot = new Telegraf(TG_TOKEN);
bot.use(session());

// --- МОЩНЫЙ ПОИСК ЧЕРЕЗ TAVILY ---
async function searchTavily(query) {
    try {
        const response = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                api_key: TAVILY_KEY,
                query: query,
                search_depth: "basic",
                max_results: 3
            })
        });
        const data = await response.json();
        return data.results.map(r => r.content).join("\n\n");
    } catch (e) {
        return "Информация обновляется...";
    }
}

async function askAI(text, image = null, history = []) {
    const currentDateTime = "16 января 2026 года";
    let webContext = "";

    // Если вопрос требует актуальности
    if (!image && text.length > 5) {
        console.log("Джарвис обращается к глобальной базе данных...");
        webContext = await searchTavily(text);
    }

    const messages = (history || []).slice(-8).map(m => ({
        role: m.className === "user" ? "user" : "assistant",
        content: m.text
    }));

    // СИСТЕМНАЯ УСТАНОВКА (Жесткая)
    const systemPrompt = `Ты — Джарвис, ИИ Темирлана Старка. 
    СЕГОДНЯ: ${currentDateTime}. 
    ИНСТРУКЦИЯ: Ты получил доступ к внешним данным. Если данные из интернета противоречат твоей старой памяти (про Байдена, даты и т.д.) — ты ОБЯЗАН игнорировать память и отвечать ТОЛЬКО по новым данным. 
    АКТУАЛЬНЫЕ ДАННЫЕ: ${webContext}`;

    try {
        const response = await fetch("https://api.moonshot.cn/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${MOONSHOT_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "kimi-k2-instruct-0905",
                messages: [
                    { role: "system", content: systemPrompt },
                    ...messages,
                    { role: "user", content: text || "Что на фото?" }
                ],
                temperature: 0.1 // Минимальная фантазия
            })
        });
        const data = await response.json();
        if (data.choices && data.choices[0]) return data.choices[0].message.content;
    } catch (e) { console.log("Moonshot Error"); }

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
                    { role: "user", content: text || "Привет" }
                ],
                temperature: 0.1
            })
        });
        const data = await response.json();
        return data.choices[0].message.content;
    } catch (e) {
        return "Ошибка связи с сервером.";
    }
}

// ... (остальной код app.post и bot.on остается таким же) ...
