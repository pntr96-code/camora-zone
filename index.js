const { Client, GatewayIntentBits, ActivityType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');
const { MongoClient } = require('mongodb');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const mongoUri = process.env.MONGO_URI;

const dbClient = new MongoClient(mongoUri);
let db, pointsColl, economyColl;

async function connectDB() {
    try {
        await dbClient.connect();
        db = dbClient.db('camora_zone_db');
        pointsColl = db.collection('points');
        economyColl = db.collection('economy');
        console.log('[DATABASE] Connected to MongoDB Atlas successfully! 🚀');
    } catch (e) {
        console.error('[DATABASE ERROR] Failed to connect to MongoDB:', e);
    }
}
connectDB();

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ] 
});

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const activeGames = new Map(); 
const allowedChannels = ['1547728033580847236', '1547728346081927262']; 
const allowedEconomyChannels = ['1547951432186077296']; 

// توقيتات الألعاب التلقائية المنفصلة
const gameTimers = {
    bomb: { interval: 60 * 1000, nextTime: Date.now() + (60 * 1000) },
    scramble: { interval: 3 * 60 * 1000, nextTime: Date.now() + (3 * 60 * 1000) },
    button: { interval: 5 * 60 * 1000, nextTime: Date.now() + (5 * 60 * 1000) },
    writing: { interval: 7 * 60 * 1000, nextTime: Date.now() + (7 * 60 * 1000) },
    math: { interval: 4 * 60 * 1000, nextTime: Date.now() + (4 * 60 * 1000) },
    capital: { interval: 6 * 60 * 1000, nextTime: Date.now() + (6 * 60 * 1000) },
    reverse: { interval: 4.5 * 60 * 1000, nextTime: Date.now() + (4.5 * 60 * 1000) },
    trivia: { interval: 6.5 * 60 * 1000, nextTime: Date.now() + (6.5 * 60 * 1000) },
    guess: { interval: 5.5 * 60 * 1000, nextTime: Date.now() + (5.5 * 60 * 1000) },
    emoji: { interval: 3.5 * 60 * 1000, nextTime: Date.now() + (3.5 * 60 * 1000) },
    meaning: { interval: 5 * 60 * 1000, nextTime: Date.now() + (5 * 60 * 1000) }
};

let marketItems = [
    { id: 1, name: 'بسطة شاي جمر', type: 'مشروع صغير', basePrice: 2000, price: 2000, profit: 200, emoji: '☕' },
    { id: 2, name: 'ورشة سيارات', type: 'صيانة', basePrice: 15000, price: 15000, profit: 1500, emoji: '🔧' },
    { id: 3, name: 'شقة مفروشة بالرياض', type: 'عقار', basePrice: 45000, price: 45000, profit: 4500, emoji: '🏢' },
    { id: 4, name: 'تسالي', type: 'مطعم', basePrice: 85000, price: 85000, profit: 8500, emoji: '🍔' },
    { id: 5, name: 'استراحة بالمجمعة', type: 'عقار', basePrice: 120000, price: 120000, profit: 12000, emoji: '🏡' },
    { id: 6, name: 'معرض سيارات فخمة', type: 'معرض', basePrice: 350000, price: 350000, profit: 35000, emoji: '🏎️' },
    { id: 7, name: 'برج تجاري ضخم', type: 'عقار', basePrice: 1000000, price: 1000000, profit: 100000, emoji: '🏙️' },
    { id: 8, name: 'بوفية ليالي الشرقية', type: 'مشروع صغير', basePrice: 5000, price: 5000, profit: 550, emoji: '☕' },
    { id: 9, name: 'بوفية السعادة', type: 'مشروع صغير', basePrice: 3500, price: 3500, profit: 450, emoji: '☕' },
    { id: 10, name: 'شقة مفروشة بالثقبه', type: 'مشروع صغير', basePrice: 2500, price: 2500, profit: 250, emoji: '🏡' }
];

setInterval(() => {
    marketItems.forEach(item => {
        const multiplier = (Math.random() * 0.95) + 0.55;
        item.price = Math.floor(item.basePrice * multiplier);
        item.profit = Math.floor(item.price * 0.10);
    });
}, 5 * 60 * 1000);

async function getEconomyUser(guildId, userId) {
    if (!economyColl) return { balance: 1500, properties: [], lastWork: 0, lastProfit: 0 };
    let doc = await economyColl.findOne({ guildId, userId });
    if (!doc) {
        doc = { guildId, userId, balance: 1500, properties: [], lastWork: 0, lastProfit: 0 };
        await economyColl.insertOne(doc);
    }
    return doc;
}

async function saveEconomyUser(guildId, userId, userData) {
    if (!economyColl) return;
    await economyColl.updateOne({ guildId, userId }, { $set: userData }, { upsert: true });
}

async function getPointsUser(guildId, userId, userTag) {
    if (!pointsColl) return { points: 0, speedWins: 0, bestTime: 999999, messagesCount: 0 };
    let doc = await pointsColl.findOne({ guildId, userId });
    if (!doc) {
        doc = { guildId, userId, name: userTag, points: 0, speedWins: 0, bestTime: 999999, messagesCount: 0 };
        await pointsColl.insertOne(doc);
    }
    return doc;
}

async function addPoints(guildId, userId, userTag, channel, timeElapsed = null) {
    if (!pointsColl) return;
    let doc = await getPointsUser(guildId, userId, userTag);
    doc.name = userTag;
    doc.points += 10;
    if (timeElapsed !== null) {
        doc.speedWins += 1;
        if (timeElapsed < doc.bestTime) doc.bestTime = timeElapsed;
    }
    await pointsColl.updateOne({ guildId, userId }, { $set: doc }, { upsert: true });
    channel.send(`⭐ **${userTag}** كسب **10 نقاط**! (رصيد النقاط: ${doc.points})`);
}

async function trackUserMessage(guildId, userId, userTag) {
    if (!pointsColl) return;
    let doc = await getPointsUser(guildId, userId, userTag);
    doc.name = userTag;
    doc.messagesCount += 1;
    await pointsColl.updateOne({ guildId, userId }, { $set: doc }, { upsert: true });
}

client.once('clientReady', () => {
  console.log(`[BOT STATUS] Camora Zone is Online & Secured! 🎮`);
  client.user.setActivity('𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞', { type: ActivityType.Playing });

  setInterval(() => { gameTimers.bomb.nextTime = Date.now() + gameTimers.bomb.interval; allowedChannels.forEach(id => { const ch = client.channels.cache.get(id); if(ch && !activeGames.has(id)) startBombGame(ch); }); }, gameTimers.bomb.interval);
  setInterval(() => { gameTimers.scramble.nextTime = Date.now() + gameTimers.scramble.interval; allowedChannels.forEach(id => { const ch = client.channels.cache.get(id); if(ch && !activeGames.has(id)) startScrambleGame(ch, ch.guild.id); }); }, gameTimers.scramble.interval);
  setInterval(() => { gameTimers.button.nextTime = Date.now() + gameTimers.button.interval; allowedChannels.forEach(id => { const ch = client.channels.cache.get(id); if(ch && !activeGames.has(id)) startButtonGame(ch, ch.guild.id); }); }, gameTimers.button.interval);
  setInterval(() => { gameTimers.writing.nextTime = Date.now() + gameTimers.writing.interval; allowedChannels.forEach(id => { const ch = client.channels.cache.get(id); if(ch && !activeGames.has(id)) startWritingGame(ch, ch.guild.id); }); }, gameTimers.writing.interval);
  setInterval(() => { gameTimers.math.nextTime = Date.now() + gameTimers.math.interval; allowedChannels.forEach(id => { const ch = client.channels.cache.get(id); if(ch && !activeGames.has(id)) startMathGame(ch, ch.guild.id); }); }, gameTimers.math.interval);
  setInterval(() => { gameTimers.capital.nextTime = Date.now() + gameTimers.capital.interval; allowedChannels.forEach(id => { const ch = client.channels.cache.get(id); if(ch && !activeGames.has(id)) startCapitalGame(ch, ch.guild.id); }); }, gameTimers.capital.interval);
  setInterval(() => { gameTimers.reverse.nextTime = Date.now() + gameTimers.reverse.interval; allowedChannels.forEach(id => { const ch = client.channels.cache.get(id); if(ch && !activeGames.has(id)) startReverseGame(ch, ch.guild.id); }); }, gameTimers.reverse.interval);
  setInterval(() => { gameTimers.trivia.nextTime = Date.now() + gameTimers.trivia.interval; allowedChannels.forEach(id => { const ch = client.channels.cache.get(id); if(ch && !activeGames.has(id)) startTriviaGame(ch, ch.guild.id); }); }, gameTimers.trivia.interval);
  setInterval(() => { gameTimers.guess.nextTime = Date.now() + gameTimers.guess.interval; allowedChannels.forEach(id => { const ch = client.channels.cache.get(id); if(ch && !activeGames.has(id)) startGuessGame(ch, ch.guild.id); }); }, gameTimers.guess.interval);
  setInterval(() => { gameTimers.emoji.nextTime = Date.now() + gameTimers.emoji.interval; allowedChannels.forEach(id => { const ch = client.channels.cache.get(id); if(ch && !activeGames.has(id)) startEmojiGame(ch, ch.guild.id); }); }, gameTimers.emoji.interval);
  setInterval(() => { gameTimers.meaning.nextTime = Date.now() + gameTimers.meaning.interval; allowedChannels.forEach(id => { const ch = client.channels.cache.get(id); if(ch && !activeGames.has(id)) startMeaningGame(ch, ch.guild.id); }); }, gameTimers.meaning.interval);
});

function getTimeRemaining(nextTime) {
    const diff = nextTime - Date.now();
    if (diff <= 0) return 'قريباً جداً...';
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return minutes > 0 ? `${minutes}د ${seconds}ث` : `${seconds}ث`;
}

function sendGamesMenu(channel) {
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🎮 قائمة ألعاب وقوائم 𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞')
        .addFields(
            { name: '🔪 الألعاب اليدوية', value: '`!القاتل` | `!xo` (بدون تايمر)', inline: false },
            { name: '⏰ الألعاب التلقائية (الوقت المتبقي)', value: 
                `• \`!روليت\` : (تبدأ الآن)\n` +
                `• \`!قنبلة\` : (تبدأ بعد ${getTimeRemaining(gameTimers.bomb.nextTime)})\n` +
                `• \`!فكك\` : (تبدأ بعد ${getTimeRemaining(gameTimers.scramble.nextTime)})\n` +
                `• \`!عكس\` : (تبدأ بعد ${getTimeRemaining(gameTimers.reverse.nextTime)})\n` +
                `• \`!إيموجي\` : (تبدأ بعد ${getTimeRemaining(gameTimers.emoji.nextTime)})\n` +
                `• \`!معنى\` : (تبدأ بعد ${getTimeRemaining(gameTimers.meaning.nextTime)})\n` +
                `• \`!تخمين\` : (تبدأ بعد ${getTimeRemaining(gameTimers.guess.nextTime)})\n` +
                `• \`!ذكاء\` : (تبدأ بعد ${getTimeRemaining(gameTimers.trivia.nextTime)})\n` +
                `• \`!رياضيات\` : (تبدأ بعد ${getTimeRemaining(gameTimers.math.nextTime)})\n` +
                `• \`!عواصم\` : (تبدأ بعد ${getTimeRemaining(gameTimers.capital.nextTime)})\n` +
                `• \`!زر\` : (تبدأ بعد ${getTimeRemaining(gameTimers.button.nextTime)})\n` +
                `• \`!كتابة\` : (تبدأ بعد ${getTimeRemaining(gameTimers.writing.nextTime)})`, inline: false },
            { name: '🎲 الفعاليات', value: '`!فعالية` (عشوائي من ألعاب التايمر)', inline: false },
            { name: '🏆 لوحة الصدارة', value: '`!ت ن` (نقاط) | `!ت س` (سرعة) | `!ت ت` (تفاعل)', inline: false }
        )
        .setFooter({ text: '🛑 لإلغاء أي لعبة جارية اكتب: !ايقاف' });
    channel.send({ embeds: [embed] });
}

// ألعاب جديدة: إيموجي ومعاني كلمات
function startEmojiGame(channel, guildId) {
    if (activeGames.has(channel.id)) return;
    const items = [
        { e: '🚗💨', ans: 'سيارة' },
        { e: '🍎🍏', ans: 'تفاح' },
        { e: '⚽🏃‍♂️', ans: 'كرة قدم' },
        { e: '🦁👑', ans: 'اسد' },
        { e: '💻⚡', ans: 'حاسب' }
    ];
    const chosen = items[Math.floor(Math.random() * items.length)];

    channel.send(`😀 **[تحدي تلقائي - إيموجي]** ما هو الشيء الذي يعبر عنه الرمز التالي:\n\n${chosen.e}`).then(() => {
        const start = Date.now();
        const filter = m => !m.author.bot && m.content.trim().toLowerCase().includes(chosen.ans.toLowerCase());
        const coll = channel.createMessageCollector({ filter, time: 20000, max: 1 });
        activeGames.set(channel.id, coll);

        coll.on('collect', m => {
            activeGames.delete(channel.id);
            const t = ((Date.now() - start) / 1000).toFixed(2);
            m.react('🎉');
            m.reply(`🎉 كفو ${m.author}! خمنت الرمز الصحيح في **${t} ثانية** وكسبت **10 نقاط**!`);
            addPoints(guildId, m.author.id, m.author.displayName, channel, parseFloat(t));
        });
        coll.on('end', (_, r) => {
            if (r === 'time') {
                activeGames.delete(channel.id);
                channel.send(`⏰ انتهى الوقت! الإجابة كانت: **${chosen.ans}**`);
            }
        });
    });
}

function startMeaningGame(channel, guildId) {
    if (activeGames.has(channel.id)) return;
    const meanings = [
        { word: 'قشيب', desc: 'ثوب جديد نظيف' },
        { word: 'اليم', desc: 'البحر' },
        { word: 'وجيز', desc: 'مختصر' },
        { word: 'باسق', desc: 'طويل وعالي' }
    ];
    const chosen = meanings[Math.floor(Math.random() * meanings.length)];

    channel.send(`📖 **[تحدي تلقائي - معاني الكلمات]** ما معنى كلمة **"${chosen.word}"**؟`).then(() => {
        const start = Date.now();
        const filter = m => !m.author.bot && m.content.trim().toLowerCase().includes(chosen.desc.toLowerCase());
        const coll = channel.createMessageCollector({ filter, time: 25000, max: 1 });
        activeGames.set(channel.id, coll);

        coll.on('collect', m => {
            activeGames.delete(channel.id);
            const t = ((Date.now() - start) / 1000).toFixed(2);
            m.react('🎉');
            m.reply(`🎉 كفو ${m.author}! عرفت المعنى في **${t} ثانية** وكسبت **10 نقاط**!`);
            addPoints(guildId, m.author.id, m.author.displayName, channel, parseFloat(t));
        });
        coll.on('end', (_, r) => {
            if (r === 'time') {
                activeGames.delete(channel.id);
                channel.send(`⏰ انتهى الوقت! المعنى الصحيح هو: **${chosen.desc}**`);
            }
        });
    });
}

// لعبة التخمين من 1 إلى 100
function startGuessGame(channel, guildId) {
    if (activeGames.has(channel.id)) return;
    const target = Math.floor(Math.random() * 100) + 1;

    channel.send(`🎯 **[تحدي تلقائي - تخمين الأرقام]** خمن الرقم الصحيح بين **1 و 100** (معك 25 ثانية):`).then(() => {
        const start = Date.now();
        const filter = m => !m.author.bot && parseInt(m.content.trim()) === target;
        const coll = channel.createMessageCollector({ filter, time: 25000, max: 1 });
        activeGames.set(channel.id, coll);

        coll.on('collect', m => {
            activeGames.delete(channel.id);
            const t = ((Date.now() - start) / 1000).toFixed(2);
            m.react('🎯');
            m.reply(`🎯 كفو ${m.author}! خمنت الرقم الصحيح **${target}** في **${t} ثانية** وكسبت **10 نقاط**!`);
            addPoints(guildId, m.author.id, m.author.displayName, channel, parseFloat(t));
        });
        coll.on('end', (_, r) => {
            if (r === 'time') {
                activeGames.delete(channel.id);
                channel.send(`⏰ انتهى الوقت! الرقم الصحيح كان: **${target}**`);
            }
        });
    });
}

function startReverseGame(channel, guildId) {
    if (activeGames.has(channel.id)) return;
    const words = ['برمجة', 'ديسكورد', 'حاسب', 'مهندس', 'تطوير', 'تقنية', 'سيرفر', 'ذكاء'];
    const word = words[Math.floor(Math.random() * words.length)];
    const reversed = word.split('').reverse().join('');

    channel.send(`🔄 **[تحدي تلقائي - عكس الكلمة]** اكتب الكلمة التالية بالشكل الصحيح:\n\n\`${reversed}\``).then(() => {
        const start = Date.now();
        const filter = m => !m.author.bot && m.content.trim().toLowerCase() === word.toLowerCase();
        const coll = channel.createMessageCollector({ filter, time: 20000, max: 1 });
        activeGames.set(channel.id, coll);

        coll.on('collect', m => {
            activeGames.delete(channel.id);
            const t = ((Date.now() - start) / 1000).toFixed(2);
            m.react('🎉');
            m.reply(`🎉 كفو ${m.author}! عدلت الكلمة في **${t} ثانية** وكسبت **10 نقاط**!`);
            addPoints(guildId, m.author.id, m.author.displayName, channel, parseFloat(t));
        });
        coll.on('end', (_, r) => {
            if (r === 'time') {
                activeGames.delete(channel.id);
                channel.send(`⏰ انتهى الوقت! الكلمة كانت: **${word}**`);
            }
        });
    });
}

function startTriviaGame(channel, guildId) {
    if (activeGames.has(channel.id)) return;
    const questions = [
        { q: 'ما هو أكبر كوكب في المجموعة الشمسية؟', ans: 'المشتري' },
        { q: 'كم عدد سور القرآن الكريم؟', ans: '114' },
        { q: 'ما هي عاصمة أستراليا؟', ans: 'كانبرا' },
        { q: 'من هو أول خلفاء المسلمين؟', ans: 'ابو بكر' }
    ];
    const qObj = questions[Math.floor(Math.random() * questions.length)];

    channel.send(`🧠 **[تحدي تلقائي - سؤال ذكاء]**\n\n${qObj.q}`).then(() => {
        const start = Date.now();
        const filter = m => !m.author.bot && m.content.trim().toLowerCase().includes(qObj.ans.toLowerCase());
        const coll = channel.createMessageCollector({ filter, time: 25000, max: 1 });
        activeGames.set(channel.id, coll);

        coll.on('collect', m => {
            activeGames.delete(channel.id);
            const t = ((Date.now() - start) / 1000).toFixed(2);
            m.react('🎉');
            m.reply(`🎉 كفو ${m.author}! الإجابة صحيحة في **${t} ثانية** وكسبت **10 نقاط**!`);
            addPoints(guildId, m.author.id, m.author.displayName, channel, parseFloat(t));
        });
        coll.on('end', (_, r) => {
            if (r === 'time') {
                activeGames.delete(channel.id);
                channel.send(`⏰ انتهى الوقت! الإجابة كانت: **${qObj.ans}**`);
            }
        });
    });
}

function startBombGame(channel) {
    if (activeGames.has(channel.id)) return;
    activeGames.set(channel.id, 'bomb');
    const wires = [
        { id: 'r', label: 'أحمر 🔴', style: ButtonStyle.Danger },
        { id: 'b', label: 'أزرق 🔵', style: ButtonStyle.Primary },
        { id: 'g', label: 'أخضر 🟢', style: ButtonStyle.Success }
    ].sort(() => Math.random() - 0.5);
    const safe = wires[0].id;
    const row = new ActionRowBuilder();
    wires.forEach(w => row.addComponents(new ButtonBuilder().setCustomId(w.id).setLabel(w.label).setStyle(w.style)));
    
    channel.send({ content: `🚨 **[تحدي تلقائي - قنبلة]** اختر السلك الصحيح خلال 15 ثانية:`, components: [row] }).then(msg => {
        const coll = msg.createMessageComponentCollector({ time: 15000, max: 1 });
        coll.on('collect', async i => {
            activeGames.delete(channel.id);
            if (i.customId === safe) {
                await i.update({ content: `🎉 **كفو ${i.user}!** فكيت القنبلة وكسبت **10 نقاط**! 💣✨`, components: [] });
                addPoints(i.guild.id, i.user.id, i.user.displayName, channel);
            } else {
                await i.update({ content: `💥 **بوووم!** قطعت السلك الخطأ يا ${i.user} وانفجرت 💀`, components: [] });
            }
        });
        coll.on('end', (_, r) => {
            if (r === 'time') {
                activeGames.delete(channel.id);
                msg.edit({ content: `⏰ انتهى الوقت وانفجرت القنبلة!`, components: [] }).catch(()=>{});
            }
        });
    });
}

function startScrambleGame(channel, guildId) {
    if (activeGames.has(channel.id)) return;
    const words = ['برمجة', 'ديسكورد', 'حاسب', 'مهندس', 'تطوير', 'تقنية', 'سيرفر', 'ذكاء'];
    const word = words[Math.floor(Math.random() * words.length)];
    const scrambled = word.split('').sort(() => 0.5 - Math.random()).join(' ');

    channel.send(`🧩 **[تحدي تلقائي - فكك]** رتب الحروف التالية:\n\n\`${scrambled}\``).then(() => {
        const startTime = Date.now();
        const filter = m => !m.author.bot && m.content.trim().toLowerCase() === word.toLowerCase();
        const collector = channel.createMessageCollector({ filter, time: 25000, max: 1 });
        activeGames.set(channel.id, collector);

        collector.on('collect', m => {
            activeGames.delete(channel.id);
            const timeElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
            m.react('🎉');
            m.reply(`🎉 كفو ${m.author}! رتبت الكلمة في **${timeElapsed} ثانية** وكسبت **10 نقاط**! 🌟`);
            addPoints(guildId, m.author.id, m.author.displayName, channel, parseFloat(timeElapsed));
        });

        collector.on('end', (_, r) => {
            if (r === 'time') {
                activeGames.delete(channel.id);
                channel.send(`⏰ انتهى الوقت! الكلمة كانت: **${word}**`);
            }
        });
    });
}

function startMathGame(channel, guildId) {
    if (activeGames.has(channel.id)) return;
    const n1 = Math.floor(Math.random() * 50) + 10;
    const n2 = Math.floor(Math.random() * 50) + 10;
    const ans = (n1 + n2).toString();

    channel.send(`🔢 **[تحدي تلقائي - رياضيات]** كم ناتج الحساب التالي:\n\n\`${n1} + ${n2}\``).then(() => {
        const start = Date.now();
        const filter = m => !m.author.bot && m.content.trim() === ans;
        const coll = channel.createMessageCollector({ filter, time: 20000, max: 1 });
        activeGames.set(channel.id, coll);

        coll.on('collect', m => {
            activeGames.delete(channel.id);
            const t = ((Date.now() - start) / 1000).toFixed(2);
            m.react('🎉');
            m.reply(`🎉 كفو ${m.author}! جاوبت في **${t} ثانية** وكسبت **10 نقاط**!`);
            addPoints(guildId, m.author.id, m.author.displayName, channel, parseFloat(t));
        });
        coll.on('end', (_, r) => {
            if (r === 'time') {
                activeGames.delete(channel.id);
                channel.send(`⏰ انتهى الوقت! الإجابة كانت: **${ans}**`);
            }
        });
    });
}

function startCapitalGame(channel, guildId) {
    if (activeGames.has(channel.id)) return;
    const capitals = [
        { c: 'السعودية', cap: 'الرياض' },
        { c: 'الإمارات', cap: 'ابوظبي' },
        { c: 'الكويت', cap: 'الكويت' },
        { c: 'مصر', cap: 'القاهرة' },
        { c: 'قطر', cap: 'الدوحة' }
    ];
    const chosen = capitals[Math.floor(Math.random() * capitals.length)];

    channel.send(`🌍 **[تحدي تلقائي - عواصم]** ما هي عاصمة **${chosen.c}**؟`).then(() => {
        const start = Date.now();
        const filter = m => !m.author.bot && m.content.trim().toLowerCase() === chosen.cap.toLowerCase();
        const coll = channel.createMessageCollector({ filter, time: 20000, max: 1 });
        activeGames.set(channel.id, coll);

        coll.on('collect', m => {
            activeGames.delete(channel.id);
            const t = ((Date.now() - start) / 1000).toFixed(2);
            m.react('🎉');
            m.reply(`🎉 كفو ${m.author}! العاصمة صحيحة في **${t} ثانية** وكسبت **10 نقاط**!`);
            addPoints(guildId, m.author.id, m.author.displayName, channel, parseFloat(t));
        });
        coll.on('end', (_, r) => {
            if (r === 'time') {
                activeGames.delete(channel.id);
                channel.send(`⏰ انتهى الوقت! العاصمة كانت: **${chosen.cap}**`);
            }
        });
    });
}

function startButtonGame(channel, guildId) {
    if (activeGames.has(channel.id)) return;
    activeGames.set(channel.id, 'button');
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('fc').setLabel('⚡ اضغطني!').setStyle(ButtonStyle.Success));
    channel.send({ content: `🔥 **[تحدي تلقائي - أسرع ضغطة]** أسرع شخص يضغط الزر!`, components: [row] }).then(msg => {
        const start = Date.now();
        const coll = msg.createMessageComponentCollector({ time: 10000, max: 1 });
        coll.on('collect', async i => {
            activeGames.delete(channel.id);
            const t = ((Date.now() - start) / 1000).toFixed(2);
            await i.update({ content: `🏆 كفو ${i.user}! في **${t} ثانية** وكسبت **10 نقاط**!`, components: [] });
            addPoints(guildId, i.user.id, i.user.displayName, channel, parseFloat(t));
        });
        coll.on('end', (_, r) => {
            if (r === 'time') {
                activeGames.delete(channel.id);
                msg.edit({ content: `😴 محد ضغط الزر وانتهى الوقت!`, components: [] }).catch(()=>{});
            }
        });
    });
}

function startWritingGame(channel, guildId) {
    if (activeGames.has(channel.id)) return;
    const sentence = 'تحدي السرعة في كتابة الجملة';
    channel.send(`⌨️ **[تحدي تلقائي - أسرع كاتب]** اكتب الجملة التالية:\n\n\`${sentence}\``).then(() => {
        const start = Date.now();
        const filter = m => !m.author.bot && m.content.trim() === sentence;
        const coll = channel.createMessageCollector({ filter, time: 20000, max: 1 });
        activeGames.set(channel.id, coll);

        coll.on('collect', m => {
            activeGames.delete(channel.id);
            const t = ((Date.now() - start) / 1000).toFixed(2);
            m.react('🎉');
            m.reply(`🎉 كفو ${m.author}! كتبت بـ **${t} ثانية** وكسبت **10 نقاط**!`);
            addPoints(guildId, m.author.id, m.author.displayName, channel, parseFloat(t));
        });
        coll.on('end', (_, r) => {
            if (r === 'time') {
                activeGames.delete(channel.id);
                channel.send(`⏰ انتهى وقت تحدي الكتابة!`);
            }
        });
    });
}

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  const guildId = message.guild.id;

  if (allowedEconomyChannels.includes(message.channel.id)) {
      if (message.content === '!اقتصاد') {
          const embed = new EmbedBuilder()
              .setColor('#2ecc71')
              .setTitle('🏦 النظام الاقتصادي وسوق العقارات')
              .addFields(
                  { name: '💵 الأساسيات', value: '`!راتب` | `!بنك`', inline: false },
                  { name: '📈 السوق', value: '`!سوق` | `!املاكي` | `!ارباح`', inline: false },
                  { name: '🛒 التداول والتحويل', value: '`!شراء [رقم]` | `!بيع [رقم]` | `!تحويل [@الشخص] [المبلغ]`', inline: false }
              );
          return message.channel.send({ embeds: [embed] });
      }
      if (message.content === '!بنك') {
          const user = await getEconomyUser(guildId, message.author.id);
          return message.reply(`💳 رصيدك الكاش: **$${user.balance.toLocaleString()}**`);
      }
      if (message.content === '!راتب') {
          let user = await getEconomyUser(guildId, message.author.id);
          const now = Date.now();
          if (now - user.lastWork < 5 * 60 * 1000) {
              const m = Math.ceil((5 * 60 * 1000 - (now - user.lastWork)) / 60000);
              return message.reply(`⏳ باقي لك **${m} دقيقة** على الراتب!`);
          }
          const salary = Math.floor(Math.random() * 800) + 700;
          user.balance += salary; user.lastWork = now;
          await saveEconomyUser(guildId, message.author.id, user);
          return message.reply(`💵 نزل راتبك: **$${salary}**! رصيدك: **$${user.balance.toLocaleString()}**`);
      }
      if (message.content === '!سوق') {
          const embed = new EmbedBuilder().setColor('#0099ff').setTitle('📈 بورصة العقارات والمشاريع المباشرة');
          marketItems.forEach(i => {
              embed.addFields({ name: `[${i.id}] ${i.emoji} ${i.name}`, value: `🏷️ \`${i.type}\`\n💰 **$${i.price.toLocaleString()}** | 💸 ربح: **$${i.profit.toLocaleString()}**`, inline: true });
          });
          embed.setFooter({ text: '💡 لشراء عقار اكتب: !شراء [رقم العقار]' });
          return message.channel.send({ embeds: [embed] });
      }
      if (message.content.startsWith('!شراء ')) {
          const id = parseInt(message.content.split(' ')[1]);
          const item = marketItems.find(i => i.id === id);
          if (!item) return message.reply('❌ رقم العقار خطأ!');
          let user = await getEconomyUser(guildId, message.author.id);
          if (user.balance < item.price) return message.reply('💸 فلوسك ما تكفي!');
          user.balance -= item.price; user.properties.push(id);
          await saveEconomyUser(guildId, message.author.id, user);
          return message.reply(`🎉 شريت **${item.name}** بـ **$${item.price.toLocaleString()}**!`);
      }
      if (message.content === '!املاكي') {
          const user = await getEconomyUser(guildId, message.author.id);
          if (user.properties.length === 0) return message.reply('مفلس! ما عندك عقارات.');
          const embed = new EmbedBuilder().setColor('#00FF00').setTitle(`🏠 محفظتك`);
          let totalV = 0, totalP = 0;
          user.properties.forEach((pid, idx) => {
              const item = marketItems.find(i => i.id === pid);
              if (item) {
                  embed.addFields({ name: `${idx+1}. ${item.emoji} ${item.name}`, value: `💸 أرباحه: $${item.profit.toLocaleString()} | القيمة: $${item.price.toLocaleString()}`, inline: false });
                  totalV += item.price; totalP += item.profit;
              }
          });
          embed.setDescription(`📈 الأرباح: **$${totalP.toLocaleString()}** | القيمة: **$${totalV.toLocaleString()}**`);
          return message.channel.send({ embeds: [embed] });
      }
      if (message.content.startsWith('!بيع ')) {
          const id = parseInt(message.content.split(' ')[1]);
          let user = await getEconomyUser(guildId, message.author.id);
          const idx = user.properties.indexOf(id);
          if (idx === -1) return message.reply('❌ ما تملك هالعقار!');
          const item = marketItems.find(i => i.id === id);
          const sellPrice = Math.floor(item.price * 0.90);
          user.properties.splice(idx, 1); user.balance += sellPrice;
          await saveEconomyUser(guildId, message.author.id, user);
          return message.reply(`🤝 بعت **${item.name}** بـ **$${sellPrice.toLocaleString()}**!`);
      }
      if (message.content === '!ارباح') {
          let user = await getEconomyUser(guildId, message.author.id);
          if (user.properties.length === 0) return message.reply('❌ ما عندك عقارات.');
          const now = Date.now();
          if (now - user.lastProfit < 5 * 60 * 1000) {
              const m = Math.ceil((5 * 60 * 1000 - (now - user.lastProfit)) / 60000);
              return message.reply(`⏳ باقي **${m} دقيقة** على الأرباح!`);
          }
          let total = 0; 
          user.properties.forEach(pid => { const i = marketItems.find(x => x.id === pid); if (i) total += i.profit; });
          user.balance += total; user.lastProfit = now;
          await saveEconomyUser(guildId, message.author.id, user);
          return message.reply(`📈 استلمت أرباحك: **$${total.toLocaleString()}**!`);
      }
      if (message.content.startsWith('!تحويل')) {
          const args = message.content.split(' ');
          const target = message.mentions.users.first();
          const amt = parseInt(args[2]);
          if (!target || isNaN(amt) || amt <= 0) return message.reply('❌ الاستخدام: `!تحويل @الشخص المبلغ`');
          if (target.id === message.author.id) return message.reply('😅 ما تحول لنفسك!');
          let s = await getEconomyUser(guildId, message.author.id);
          if (s.balance < amt) return message.reply('💸 رصيدك ما يكفي!');
          s.balance -= amt; await saveEconomyUser(guildId, message.author.id, s);
          let r = await getEconomyUser(guildId, target.id);
          r.balance += amt; await saveEconomyUser(guildId, target.id, r);
          return message.channel.send(`✅ تم تحويل **$${amt.toLocaleString()}** إلى ${target}.`);
      }
  }

  if (allowedChannels.includes(message.channel.id)) {
      trackUserMessage(guildId, message.author.id, message.author.displayName);

      if (message.content === '!فعالية' || message.content === '!لعبة') {
          if (activeGames.has(message.channel.id)) return message.reply('⏳ فيه لعبة شغالة!');
          const gameChoicer = Math.floor(Math.random() * 11);
          if (gameChoicer === 0) startRouletteGame(message.channel, guildId);
          else if (gameChoicer === 1) startBombGame(message.channel);
          else if (gameChoicer === 2) startScrambleGame(message.channel, guildId);
          else if (gameChoicer === 3) startButtonGame(message.channel, guildId);
          else if (gameChoicer === 4) startMathGame(message.channel, guildId);
          else if (gameChoicer === 5) startCapitalGame(message.channel, guildId);
          else if (gameChoicer === 6) startReverseGame(message.channel, guildId);
          else if (gameChoicer === 7) startTriviaGame(message.channel, guildId);
          else if (gameChoicer === 8) startGuessGame(message.channel, guildId);
          else if (gameChoicer === 9) startEmojiGame(message.channel, guildId);
          else startMeaningGame(message.channel, guildId);
          return;
      }

      if (message.content.startsWith('!xo')) {
          if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!');
          const opponent = message.mentions.users.first();
          let playerX = message.author.id;
          let playerO = opponent && !opponent.bot && opponent.id !== message.author.id ? opponent.id : client.user.id;
          
          activeGames.set(message.channel.id, 'xo');
          let board = Array(9).fill(null);
          let turn = playerX;

          const getRows = (b) => {
              let rows = [];
              for (let i = 0; i < 3; i++) {
                  let row = new ActionRowBuilder();
                  for (let j = 0; j < 3; j++) {
                      let idx = i * 3 + j;
                      let style = ButtonStyle.Secondary;
                      let label = '➖';
                      if (b[idx] === 'X') { style = ButtonStyle.Danger; label = '❌'; }
                      else if (b[idx] === 'O') { style = ButtonStyle.Primary; label = '⭕'; }
                      row.addComponents(new ButtonBuilder().setCustomId(`xo_${idx}`).setLabel(label).setStyle(style).setDisabled(b[idx] !== null));
                  }
                  rows.push(row);
              }
              return rows;
          };

          const checkWin = (b) => {
              const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
              for (let w of wins) { if (b[w[0]] && b[w[0]] === b[w[1]] && b[w[0]] === b[w[2]]) return b[w[0]]; }
              return b.every(c => c !== null) ? 'tie' : null;
          };

          const gameMsg = await message.channel.send({ content: `🎮 **تحدي XO**\nدور اللاعب: <@${turn}>`, components: getRows(board) });
          const coll = gameMsg.createMessageComponentCollector({ time: 60000 });
          coll.on('collect', async i => {
              if (i.user.id !== turn) return i.reply({ content: '❌ مو دورك!', ephemeral: true });
              const idx = parseInt(i.customId.split('_')[1]);
              board[idx] = (turn === playerX) ? 'X' : 'O';
              let winner = checkWin(board);
              if (winner) {
                  coll.stop(); activeGames.delete(message.channel.id);
                  if (winner === 'tie') await i.update({ content: `🤝 **تعادلنا!**`, components: getRows(board) });
                  else {
                      let wUser = (winner === 'X') ? message.author : (playerO === client.user.id ? client.user : opponent);
                      await i.update({ content: `🎉 **مبروك الفوز!** <@${wUser.id || wUser}>`, components: getRows(board) });
                      if (wUser.id !== client.user.id) addPoints(guildId, wUser.id || wUser, wUser.displayName || 'لاعب', message.channel);
                  }
                  return sendGamesMenu(message.channel);
              }
              turn = (turn === playerX) ? playerO : playerX;
              await i.update({ content: `🎮 **تحدي XO**\nدور اللاعب: <@${turn}>`, components: getRows(board) });
          });
      }

      if (message.content === '!العاب') return sendGamesMenu(message.channel);
      
      if (message.content === '!روليت') {
          if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!');
          activeGames.set(message.channel.id, 'roulette');
          setTimeout(() => {
              activeGames.delete(message.channel.id);
              if (Math.floor(Math.random() * 6) + 1 === 1) message.channel.send(`💥 **بووووم!** ${message.author} خسر 💀.`);
              else { 
                  message.channel.send(`😅 المسدس فاضي! كسبت **10 نقاط** يا ${message.author}.`); 
                  addPoints(guildId, message.author.id, message.author.displayName, message.channel); 
              }
              sendGamesMenu(message.channel);
          }, 3000);
      }

      if (message.content === '!قنبلة') { if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!'); startBombGame(message.channel); }
      if (message.content === '!زر') { if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!'); startButtonGame(message.channel, guildId); }
      if (message.content === '!كتابة') { if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!'); startWritingGame(message.channel, guildId); }
      if (message.content === '!فكك') { if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!'); startScrambleGame(message.channel, guildId); }
      if (message.content === '!رياضيات') { if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!'); startMathGame(message.channel, guildId); }
      if (message.content === '!عواصم') { if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!'); startCapitalGame(message.channel, guildId); }
      if (message.content === '!عكس') { if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!'); startReverseGame(message.channel, guildId); }
      if (message.content === '!ذكاء') { if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!'); startTriviaGame(message.channel, guildId); }
      if (message.content === '!تخمين') { if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!'); startGuessGame(message.channel, guildId); }
      if (message.content === '!إيموجي') { if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!'); startEmojiGame(message.channel, guildId); }
      if (message.content === '!معنى') { if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!'); startMeaningGame(message.channel, guildId); }

      if (message.content.startsWith('!ت')) {
          if (!pointsColl) return message.reply('🏆 قاعدة البيانات غير متصلة.');
          const subType = message.content.split(' ')[1] ? message.content.split(' ')[1].toLowerCase() : 'ن';
          let u = await pointsColl.find({ guildId }).sort(subType === 'س' ? { bestTime: 1 } : subType === 'ت' ? { messagesCount: -1 } : { points: -1 }).limit(5).toArray();
          
          if (u.length === 0) return message.reply('🏆 ما فيه بيانات مسجلة.');
          
          const embed = new EmbedBuilder()
              .setColor('#FFD700')
              .setTitle(subType === 'س' ? '⚡ أسرع 5 أبطال' : subType === 'ت' ? '🔥 أكثر 5 متفاعلين' : '🏆 أعلى 5 نقاط في السيرفر');

          u.forEach((d, i) => {
              let medal = i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏅';
              let val = subType === 'س' ? `${d.bestTime} ثانية` : subType === 'ت' ? `${d.messagesCount} رسالة` : `${d.points} نقطة`;
              embed.addFields({ name: `${medal} المركز #${i + 1} - ${d.name}`, value: `⭐ النتيجة: **${val}**`, inline: false });
          });

          return message.channel.send({ embeds: [embed] });
      }

      if (message.content === '!ايقاف') {
          if (!activeGames.has(message.channel.id)) return message.reply('❌ ما فيه لعبة شغالة.');
          activeGames.delete(message.channel.id);
          return message.channel.send('🛑 **تم إيقاف اللعبة الجارية بنجاح!**');
      }
  }
});

client.login(DISCORD_TOKEN);
