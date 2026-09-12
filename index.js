const { Client, GatewayIntentBits, ActivityType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');
const { MongoClient } = require('mongodb');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const mongoUri = process.env.MONGO_URI;

const dbClient = new MongoClient(mongoUri, {
    serverSelectionTimeoutMS: 5000,
    tls: true,
    tlsAllowInvalidCertificates: true
});

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
const processingUsers = new Set(); 
const allowedChannels = ['1547728033580847236', '1547728346081927262', '1548010683692748821']; 
const allowedEconomyChannels = ['1547951432186077296', '1548010683692748821']; 

const lastActivityTime = new Map();
const lastMarketMessages = new Map();

const jobsList = {
    'مواطن': { name: 'مواطن 🇸🇦', salary: 500, level: 1, emoji: '🇸🇦' },
    'حارس_أمن': { name: 'حارس أمن 🛡️', salary: 700, level: 2, emoji: '🛡️' },
    'عامل_توصيل': { name: 'عامل توصيل 📦', salary: 900, level: 3, emoji: '📦' },
    'كاشير': { name: 'كاشير 🛒', salary: 1100, level: 4, emoji: '🛒' },
    'بارستا': { name: 'ساقي قهوة (بارستا) ☕', salary: 1350, level: 5, emoji: '☕' },
    'كاتب_محتوى': { name: 'كاتب محتوى 📝', salary: 1600, level: 6, emoji: '📝' },
    'محاسب': { name: 'محاسب 📊', salary: 1900, level: 7, emoji: '📊' },
    'مصمم': { name: 'مصمم جرافيك 🎨', salary: 2200, level: 8, emoji: '🎨' },
    'صحفي': { name: 'صحفي 📰', salary: 2500, level: 9, emoji: '📰' },
    'شرطي': { name: 'شرطي 👮‍♂️', salary: 2900, level: 10, emoji: '👮‍♂️' },
    'مهندس': { name: 'مهندس 💻', salary: 3400, level: 12, emoji: '💻' },
    'محامي': { name: 'محامي ⚖️', salary: 4000, level: 14, emoji: '⚖️' },
    'طبيب': { name: 'طبيب 🩺', salary: 4700, level: 16, emoji: '🩺' },
    'مبرمج': { name: 'مبرمج ⚡', salary: 5500, level: 18, emoji: '⚡' },
    'مستشار': { name: 'مستشار مالي 💼', salary: 6400, level: 20, emoji: '💼' },
    'رائد_فضاء': { name: 'رائد فضاء 🚀', salary: 7500, level: 23, emoji: '🚀' },
    'طيار': { name: 'طيار ✈️', salary: 8800, level: 26, emoji: '✈️' },
    'قاضي': { name: 'قاضي 🏛️', salary: 10300, level: 30, emoji: '🏛️' },
    'مدير_تنفيذي': { name: 'مدير تنفيذي (CEO) 👔', salary: 12500, level: 35, emoji: '👔' },
    'رجل_أعمال': { name: 'رجل أعمال أسطوري 👑', salary: 15000, level: 40, emoji: '👑' }
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

setInterval(async () => {
    marketItems.forEach(item => {
        const multiplier = (Math.random() * 0.95) + 0.55;
        item.price = Math.floor(item.basePrice * multiplier);
        item.profit = Math.floor(item.price * 0.10);
    });

    const embed = new EmbedBuilder()
        .setColor('#F1C40F')
        .setTitle('📈 تنبيه بورصة العقارات والأعمال')
        .setDescription('🔄 **تم تجديد وتحديث أسعار وأرباح السوق الآن!**\nتأكد من زيارة السوق باستخدام أمر `!سوق` لمعرفة الأسعار الجديدة.')
        .setTimestamp();

    for (const channelId of allowedEconomyChannels) {
        try {
            const channel = await client.channels.fetch(channelId);
            if (channel) {
                const oldMsgId = lastMarketMessages.get(channelId);
                if (oldMsgId) {
                    try {
                        const oldMsg = await channel.messages.fetch(oldMsgId);
                        if (oldMsg) await oldMsg.delete();
                    } catch (e) {}
                }
                const newMsg = await channel.send({ embeds: [embed] });
                lastMarketMessages.set(channelId, newMsg.id);
            }
        } catch (err) {
            console.error('Failed to update market notification:', err);
        }
    }
}, 5 * 60 * 1000);

async function getEconomyUser(guildId, userId) {
    if (!economyColl) return { guildId, userId, balance: 1500, properties: [], job: 'مواطن 🇸🇦', lastWork: 0, lastProfit: 0, lastCrime: 0, lastQuest: 0, questsCompleted: 0 };
    let doc = await economyColl.findOne({ guildId, userId });
    if (!doc) {
        doc = { guildId, userId, balance: 1500, properties: [], job: 'مواطن 🇸🇦', lastWork: 0, lastProfit: 0, lastCrime: 0, lastQuest: 0, questsCompleted: 0 };
        await economyColl.insertOne(doc);
    }
    if (!doc.job) doc.job = 'مواطن 🇸🇦';
    return doc;
}

async function saveEconomyUser(guildId, userId, userData) {
    if (!economyColl) return;
    try {
        await economyColl.updateOne(
            { guildId: guildId, userId: userId }, 
            { $set: userData }, 
            { upsert: true }
        );
    } catch (e) {
        console.error('Error saving economy user:', e);
    }
}

async function getPointsUser(guildId, userId, userTag) {
    if (!pointsColl) return { points: 0, speedWins: 0, bestTime: 999999, messagesCount: 0, xp: 0, level: 1 };
    let doc = await pointsColl.findOne({ guildId, userId });
    if (!doc) {
        doc = { guildId, userId, name: userTag, points: 0, speedWins: 0, bestTime: 999999, messagesCount: 0, xp: 0, level: 1 };
        await pointsColl.insertOne(doc);
    }
    if (doc.xp === undefined) doc.xp = 0;
    if (doc.level === undefined) doc.level = 1;
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
    await pointsColl.updateOne(
        { guildId: guildId, userId: userId }, 
        { $set: doc }, 
        { upsert: true }
    );
    channel.send(`⭐ **${userTag}** كسب **10 نقاط**! (رصيد النقاط: ${doc.points})`);
}

async function trackUserMessage(guildId, userId, userTag, channel, member) {
    if (!pointsColl) return;
    let doc = await getPointsUser(guildId, userId, userTag);
    doc.name = userTag;
    doc.messagesCount += 1;
    doc.xp += 15;

    let xpNeeded = (doc.level * doc.level) * 150;
    
    if (doc.xp >= xpNeeded) {
        doc.level += 1;
        doc.xp = 0;
        channel.send(`🎉 كفو يا <@${userId}>! لقد ارتفعت إلى **المستوى الأسطوري (Level ${doc.level})**! 🚀🔥`);

        if (member) {
            const roleName = `Level ${doc.level}`;
            const role = member.guild.roles.cache.find(r => r.name === roleName);
            if (role) {
                try {
                    await member.roles.add(role);
                } catch (e) {
                    console.error('Failed to assign level role:', e);
                }
            }
        }
    }

    await pointsColl.updateOne(
        { guildId: guildId, userId: userId }, 
        { $set: doc }, 
        { upsert: true }
    );
}

const historyTracker = { emoji: [], meaning: [], scramble: [], reverse: [], trivia: [], capital: [], writing: [] };

function getUniqueRandomItem(pool, historyKey, propertyName = null) {
    let available = pool.filter(item => !historyTracker[historyKey].includes(propertyName ? item[propertyName] : item));
    if (available.length === 0) {
        historyTracker[historyKey] = [];
        available = pool;
    }
    const chosen = available[Math.floor(Math.random() * available.length)];
    const val = propertyName ? chosen[propertyName] : chosen;
    historyTracker[historyKey].push(val);
    if (historyTracker[historyKey].length > 25) historyTracker[historyKey].shift();
    return chosen;
}

const emojiMasterPool = [
    { e: '🚗💨', ans: 'سيارة' }, { e: '🍎🍏', ans: 'تفاح' }, { e: '⚽🏃‍♂️', ans: 'كرة قدم' }, { e: '🦁👑', ans: 'اسد' }, { e: '💻⚡', ans: 'حاسب' },
    { e: '✈️🌍', ans: 'طائرة' }, { e: '🍕🧀', ans: 'بيتزا' }, { e: '🔥🚒', ans: 'اطفاء' }, { e: '👑💎', ans: 'تاج' }, { e: '🌙⭐', ans: 'ليل' },
    { e: '☕️📖', ans: 'قهوة' }, { e: '🐱🐟', ans: 'قطة' }, { e: '🌊🏄‍♂️', ans: 'بحر' }, { e: '🍌🐒', ans: 'موز' }, { e: '🚀🌌', ans: 'فضاء' },
    { e: '📸✨', ans: 'كاميرا' }, { e: '🍔🥤', ans: 'وجبة' }, { e: '🎧🎶', ans: 'سماعة' }, { e: '⚽🏆', ans: 'بطولة' }, { e: '💡🧠', ans: 'فكرة' }
];

const meaningMasterPool = [
    { word: 'قشيب', desc: 'ثوب جديد نظيف' }, { word: 'اليم', desc: 'البحر' }, { word: 'وجيز', desc: 'مختصر' }, { word: 'باسق', desc: 'طويل وعالي' },
    { word: 'صنديد', desc: 'شجاع قوي' }, { word: 'هوجاء', desc: 'ريح شديدة' }, { word: 'رغد', desc: 'عيش طيب واسع' }, { word: 'وثيق', desc: 'مؤكد قوي' },
    { word: 'همام', desc: 'عظيم الهمة شجاع' }, { word: 'حسام', desc: 'السيف القاطع' }, { word: 'عسجد', desc: 'الذهب الخالص' }, { word: 'فرات', desc: 'ماء عذب شديد العذوبة' }
];

const scrambleMasterPool = [
    'برمجة', 'ديسكورد', 'حاسب', 'مهندس', 'تطوير', 'تقنية', 'سيرفر', 'ذكاء', 'معلومات', 'استثمار',
    'استراحه', 'سيارات', 'جامعة', 'عقارات', 'تطبيقات', 'مليارات', 'مسابقات', 'محطات', 'مسلسلات', 'طائرات',
    'ديجيتال', 'الاصطناعي', 'التكنولوجيا', 'البورصة', 'التجارة', 'المحركات', 'الإلكترونيات', 'المستقبل'
];

const triviaMasterPool = [
    { q: 'ما هو أكبر كوكب في المجموعة الشمسية؟', ans: 'المشتري' }, { q: 'كم عدد سور القرآن الكريم؟', ans: '114' },
    { q: 'ما هي عاصمة أستراليا؟', ans: 'كانبرا' }, { q: 'من هو أول خلفاء المسلمين؟', ans: 'ابو بكر' },
    { q: 'ما هي عاصمة اليابان؟', ans: 'طوكيو' }, { q: 'في أي سنة هبط الإنسان على القمر؟', ans: '1969' },
    { q: 'ما هي عاصمة المملكة العربية السعودية؟', ans: 'الرياض' }, { q: 'كم عدد أركان الإسلام؟', ans: '5' },
    { q: 'ما هو عنصر الكيمياء الذي يرمز له بـ H2O؟', ans: 'ماء' }, { q: 'في أي قارة تقع دولة مصر؟', ans: 'افريقيا' }
];

const capitalMasterPool = [
    { c: 'السعودية', cap: 'الرياض' }, { c: 'الإمارات', cap: 'ابوظبي' }, { c: 'الكويت', cap: 'الكويت' },
    { c: 'مصر', cap: 'القاهرة' }, { c: 'قطر', cap: 'الدوحة' }, { c: 'عمان', cap: 'مسقط' },
    { c: 'البحرين', cap: 'المنامة' }, { c: 'الأردن', cap: 'عمان' }, { c: 'العراق', cap: 'بغداد' }, { c: 'لبنان', cap: 'بيروت' }
];

client.once('clientReady', () => {
  console.log(`[BOT STATUS] Camora Zone is Online & Secured with MongoDB Atlas! 🎮`);
  client.user.setActivity('𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞', { type: ActivityType.Playing });
});

function sendGamesMenu(channel) {
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🎮 قائمة ألعاب وقوائم 𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞')
        .addFields(
            { name: '🔪 الألعاب اليدوية والفعاليات', value: '`!القاتل` | `!xo [@شخص]` | `!حجر [@شخص]` | `!روليت` | `!قنبلة` | `!فكك` | `!عكس` | `!إيموجي` | `!معنى` | `!تخمين` | `!ذكاء` | `!رياضيات` | `!عواصم` | `!زر` | `!كتابة`', inline: false },
            { name: '🧠 لعبة الذاكرة (الأوراق المقلوبة)', value: '`!ذاكرة [سهل/متوسط/صعب] [@شخص]`', inline: false },
            { name: '📦 الصناديق والألعاب التفاعلية', value: '`!صناديق` (تخمين الصندوق السري الأسطوري)', inline: false },
            { name: '🎲 الفعاليات العشوائية', value: '`!فعالية` (يختار لعبة عشوائية من القائمة)', inline: false },
            { name: '🏆 لوحة الصدارة التفاعلية', value: '`!ت` (لعرض لوحة الشرف بالأزرار)', inline: false }
        )
        .setFooter({ text: '🛑 لإلغاء أي لعبة جارية اكتب: !ايقاف' });
    channel.send({ embeds: [embed] });
}

// جميع دوال الألعاب اليدوية القديمة
function startEmojiGame(channel, guildId) {
    if (activeGames.has(channel.id)) return;
    const chosen = getUniqueRandomItem(emojiMasterPool, 'emoji', 'ans');
    channel.send(`😀 **[إيموجي]** ما هو الشيء الذي يعبر عنه الرمز التالي:\n\n${chosen.e}`).then(() => {
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
        coll.on('end', (_, r) => { if (r === 'time') { activeGames.delete(channel.id); channel.send(`⏰ انتهى الوقت! الإجابة كانت: **${chosen.ans}**`); } });
    });
}

function startMeaningGame(channel, guildId) {
    if (activeGames.has(channel.id)) return;
    const chosen = getUniqueRandomItem(meaningMasterPool, 'meaning', 'word');
    channel.send(`📖 **[معاني الكلمات]** ما معنى كلمة **"${chosen.word}"**؟`).then(() => {
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
        coll.on('end', (_, r) => { if (r === 'time') { activeGames.delete(channel.id); channel.send(`⏰ انتهى الوقت! المعنى الصحيح هو: **${chosen.desc}**`); } });
    });
}

function startGuessGame(channel, guildId) {
    if (activeGames.has(channel.id)) return;
    const target = Math.floor(Math.random() * 100) + 1;
    channel.send(`🎯 **[تخمين الأرقام]** خمن الرقم الصحيح بين **1 و 100** (معك 25 ثانية):`).then(() => {
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
        coll.on('end', (_, r) => { if (r === 'time') { activeGames.delete(channel.id); channel.send(`⏰ انتهى الوقت! الرقم الصحيح كان: **${target}**`); } });
    });
}

function startReverseGame(channel, guildId) {
    if (activeGames.has(channel.id)) return;
    const word = getUniqueRandomItem(scrambleMasterPool, 'reverse');
    const reversed = word.split('').reverse().join('');
    channel.send(`🔄 **[عكس الكلمة]** اكتب الكلمة التالية بالشكل الصحيح:\n\n\`${reversed}\``).then(() => {
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
        coll.on('end', (_, r) => { if (r === 'time') { activeGames.delete(channel.id); channel.send(`⏰ انتهى الوقت! الكلمة كانت: **${word}**`); } });
    });
}

function startTriviaGame(channel, guildId) {
    if (activeGames.has(channel.id)) return;
    const qObj = getUniqueRandomItem(triviaMasterPool, 'trivia', 'q');
    channel.send(`🧠 **[سؤال ذكاء]**\n\n${qObj.q}`).then(() => {
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
        coll.on('end', (_, r) => { if (r === 'time') { activeGames.delete(channel.id); channel.send(`⏰ انتهى الوقت! الإجابة كانت: **${qObj.ans}**`); } });
    });
}

function startBombGame(channel, guildId) {
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
    channel.send({ content: `🚨 **[قنبلة]** اختر السلك الصحيح خلال 15 ثانية:`, components: [row] }).then(msg => {
        const coll = msg.createMessageComponentCollector({ time: 15000, max: 1 });
        coll.on('collect', async i => {
            activeGames.delete(channel.id);
            if (i.customId === safe) {
                await i.update({ content: `🎉 **كفو ${i.user}!** فكيت القنبلة وكسبت **10 نقاط**! 💣✨`, components: [] });
                addPoints(guildId, i.user.id, i.user.displayName, channel);
            } else {
                await i.update({ content: `💥 **بوووم!** قطعت السلك الخطأ يا ${i.user} وانفجرت 💀`, components: [] });
            }
        });
        coll.on('end', (_, r) => { if (r === 'time') { activeGames.delete(channel.id); msg.edit({ content: `⏰ انتهى الوقت وانفجرت القنبلة!`, components: [] }).catch(()=>{}); } });
    });
}

function startScrambleGame(channel, guildId) {
    if (activeGames.has(channel.id)) return;
    const word = getUniqueRandomItem(scrambleMasterPool, 'scramble');
    const scrambled = word.split('').sort(() => 0.5 - Math.random()).join(' ');
    channel.send(`🧩 **[فكك]** رتب الحروف التالية:\n\n\`${scrambled}\``).then(() => {
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
        collector.on('end', (_, r) => { if (r === 'time') { activeGames.delete(channel.id); channel.send(`⏰ انتهى الوقت! الكلمة كانت: **${word}**`); } });
    });
}

function startMathGame(channel, guildId) {
    if (activeGames.has(channel.id)) return;
    const n1 = Math.floor(Math.random() * 50) + 10;
    const n2 = Math.floor(Math.random() * 50) + 10;
    const ans = (n1 + n2).toString();
    channel.send(`🔢 **[رياضيات]** كم ناتج الحساب التالي:\n\n\`${n1} + ${n2}\``).then(() => {
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
        coll.on('end', (_, r) => { if (r === 'time') { activeGames.delete(channel.id); channel.send(`⏰ انتهى الوقت! الإجابة كانت: **${ans}**`); } });
    });
}

function startCapitalGame(channel, guildId) {
    if (activeGames.has(channel.id)) return;
    const chosen = getUniqueRandomItem(capitalMasterPool, 'capital', 'c');
    channel.send(`🌍 **[عواصم]** ما هي عاصمة **${chosen.c}**؟`).then(() => {
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
        coll.on('end', (_, r) => { if (r === 'time') { activeGames.delete(channel.id); channel.send(`⏰ انتهى الوقت! العاصمة كانت: **${chosen.cap}**`); } });
    });
}

function startButtonGame(channel, guildId) {
    if (activeGames.has(channel.id)) return;
    activeGames.set(channel.id, 'button');
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('fc').setLabel('⚡ اضغطني!').setStyle(ButtonStyle.Success));
    channel.send({ content: `🔥 **[أسرع ضغطة]** أسرع شخص يضغط الزر!`, components: [row] }).then(msg => {
        const start = Date.now();
        const coll = msg.createMessageComponentCollector({ time: 10000, max: 1 });
        coll.on('collect', async i => {
            activeGames.delete(channel.id);
            const t = ((Date.now() - start) / 1000).toFixed(2);
            await i.update({ content: `🏆 كفو ${i.user}! في **${t} ثانية** وكسبت **10 نقاط**!`, components: [] });
            addPoints(guildId, i.user.id, i.user.displayName, channel, parseFloat(t));
        });
        coll.on('end', (_, r) => { if (r === 'time') { activeGames.delete(channel.id); msg.edit({ content: `😴 محد ضغط الزر وانتهى الوقت!`, components: [] }).catch(()=>{}); } });
    });
}

function startWritingGame(channel, guildId) {
    if (activeGames.has(channel.id)) return;
    const sentence = getUniqueRandomItem(['تحدي السرعة في كتابة الجملة', 'برمجة البوتات تتطلب صبرا وتركيزا', 'المحترف لا ييأس أبدا مهما كانت الصعاب', 'الذكاء الاصطناعي يغير مستقبل العالم التقني', 'تطوير الألعاب والبرمجيات فن ممتع', 'إمبراطورية كامورا زون ترحب بالجميع'], 'writing');
    channel.send(`⌨️ **[أسرع كاتب]** اكتب الجملة التالية:\n\n\`${sentence}\``).then(() => {
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
        coll.on('end', (_, r) => { if (r === 'time') { activeGames.delete(channel.id); channel.send(`⏰ انتهى الوقت!`); } });
    });
}

function startMemoryGame(message, guildId) {
    const channel = message.channel;
    const contentLower = message.content.toLowerCase();
    let difficulty = 'سهل';
    if (contentLower.includes('متوسط')) difficulty = 'متوسط';
    else if (contentLower.includes('صعب')) difficulty = 'صعب';

    const challenger = message.author;
    let size = 3, pairsCount = 4;
    if (difficulty === 'متوسط') { size = 4; pairsCount = 8; }
    else if (difficulty === 'صعب') { size = 6; pairsCount = 18; }

    const availableEmojis = ['🍎', '🍌', '🍇', '⭐', '💎', '🔥', '🚀', '🍕', '⚽', '🎸', '🎮', '💡', '👑', '🍀', '🎯', '⚡', '🧸', '🎨'];
    let deck = [...availableEmojis.slice(0, pairsCount), ...availableEmojis.slice(0, pairsCount)].sort(() => Math.random() - 0.5);
    if (size === 3) deck = deck.slice(0, 8);

    let revealed = Array(deck.length).fill(false), matched = Array(deck.length).fill(false);
    let firstSelection = null;

    const getBoardComponents = (isEnded = false) => {
        const rows = [];
        for (let r = 0; r < size; r++) {
            const rowComps = [];
            for (let c = 0; c < size; c++) {
                const idx = r * size + c;
                if (idx >= deck.length) break;
                let label = (revealed[idx] || matched[idx]) ? deck[idx] : '❓';
                let style = matched[idx] ? ButtonStyle.Success : ((revealed[idx]) ? ButtonStyle.Primary : ButtonStyle.Secondary);
                rowComps.push(new ButtonBuilder().setCustomId(`mem_${idx}`).setLabel(label).setStyle(style).setDisabled(isEnded || matched[idx]));
            }
            rows.push(new ActionRowBuilder().addComponents(rowComps));
        }
        return rows;
    };

    channel.send({ content: `🧠 **[لعبة الذاكرة - ${difficulty}]**\nاللاعب: ${challenger}`, components: getBoardComponents() }).then(msg => {
        const coll = msg.createMessageComponentCollector({ time: 45000 });
        coll.on('collect', async i => {
            if (i.user.id !== challenger.id) return i.reply({ content: '❌ ليست لك!', ephemeral: true });
            const idx = parseInt(i.customId.replace('mem_', ''));
            if (revealed[idx] || matched[idx]) return i.reply({ content: '⚠️ مكشوفة!', ephemeral: true });
            revealed[idx] = true;
            if (firstSelection === null) {
                firstSelection = idx;
                await i.update({ content: `🧠 **[لعبة الذاكرة - ${difficulty}]**`, components: getBoardComponents() });
            } else {
                const fIdx = firstSelection; firstSelection = null;
                if (deck[fIdx] === deck[idx]) {
                    matched[fIdx] = true; matched[idx] = true;
                    if (matched.every((m, index) => m || index >= deck.length)) {
                        coll.stop();
                        addPoints(guildId, challenger.id, challenger.displayName, channel);
                        return i.update({ content: `🏆 **انتهت اللعبة! كفو ${challenger}** كسبت **10 نقاط**! 🌟`, components: getBoardComponents(true) });
                    }
                    await i.update({ content: `✨ تطابق صحيح!`, components: getBoardComponents() });
                } else {
                    await i.update({ content: `❌ خطأ!`, components: getBoardComponents() });
                    setTimeout(async () => { revealed[fIdx] = false; revealed[idx] = false; await msg.edit({ components: getBoardComponents() }).catch(()=>{}); }, 1500);
                }
            }
        });
    });
}

function startRPSGame(message, guildId) {
    const channel = message.channel;
    const challenger = message.author;
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rps_rock').setLabel('🪨 حجر').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('rps_paper').setLabel('📄 ورقة').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('rps_scissors').setLabel('✂️ مقص').setStyle(ButtonStyle.Danger)
    );
    channel.send({ content: `🤖 **[تحدي حجر ورقة مقص]**\nاختر حركتك:`, components: [row] }).then(msg => {
        const coll = msg.createMessageComponentCollector({ time: 15000, max: 1 });
        coll.on('collect', async i => {
            if (i.user.id !== challenger.id) return i.reply({ content: '❌ ليست لك!', ephemeral: true });
            const userChoice = i.customId.replace('rps_', '');
            const botChoice = ['rock', 'paper', 'scissors'][Math.floor(Math.random() * 3)];
            let res = userChoice === botChoice ? `🤝 تعادل!` : (((userChoice === 'rock' && botChoice === 'scissors') || (userChoice === 'paper' && botChoice === 'rock') || (userChoice === 'scissors' && botChoice === 'paper')) ? `🎉 فزت وكسبت **10 نقاط**!` : `💀 خسرت!`);
            if (res.includes('فزت')) addPoints(guildId, challenger.id, challenger.displayName, channel);
            await i.update({ content: res, components: [] });
        });
    });
}

function startXOGame(message, guildId) {
    const channel = message.channel;
    const challenger = message.author;
    let board = Array(9).fill(null);

    const getBoardComponents = (ended = false) => {
        const rows = [];
        for (let r = 0; r < 3; r++) {
            const rowComps = [];
            for (let c = 0; c < 3; c++) {
                const idx = r * 3 + c;
                let label = board[idx] === 'X' ? '❌' : (board[idx] === 'O' ? '⭕' : '—');
                rowComps.push(new ButtonBuilder().setCustomId(`xo_${idx}`).setLabel(label).setStyle(board[idx] ? ButtonStyle.Danger : ButtonStyle.Secondary).setDisabled(ended || board[idx] !== null));
            }
            rows.push(new ActionRowBuilder().addComponents(rowComps));
        }
        return rows;
    };

    channel.send({ content: `🎮 **[تحدي XO ضد البوت]**`, components: getBoardComponents() }).then(msg => {
        const coll = msg.createMessageComponentCollector({ time: 60000 });
        coll.on('collect', async i => {
            if (i.user.id !== challenger.id) return i.reply({ content: '⏳ ليس دورك!', ephemeral: true });
            const idx = parseInt(i.customId.replace('xo_', ''));
            board[idx] = 'X';
            
            const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
            if (wins.some(w => board[w[0]] && board[w[0]] === board[w[1]] && board[w[0]] === board[w[2]])) {
                coll.stop();
                addPoints(guildId, challenger.id, challenger.displayName, channel);
                return i.update({ content: `🎉 **كفو فزت في XO** وكسبت **10 نقاط**! 🌟`, components: getBoardComponents(true) });
            }

            const empty = board.map((v, idx) => v === null ? idx : null).filter(v => v !== null);
            if (empty.length > 0) board[empty[Math.floor(Math.random() * empty.length)]] = 'O';

            await i.update({ content: `🎮 **[تحدي XO ضد البوت]**`, components: getBoardComponents() });
        });
    });
}

function startBoxesGame(channel, guildId, userId) {
    if (activeGames.has(channel.id)) return;
    activeGames.set(channel.id, 'boxes');
    const winningBox = Math.floor(Math.random() * 9);
    const rows = [];
    for (let r = 0; r < 3; r++) {
        const rowComps = [];
        for (let c = 0; c < 3; c++) {
            const idx = r * 3 + c;
            rowComps.push(new ButtonBuilder().setCustomId(`box_${idx}`).setLabel(`صندوق ${idx + 1}`).setStyle(ButtonStyle.Primary));
        }
        rows.push(new ActionRowBuilder().addComponents(rowComps));
    }
    channel.send({ content: `📦 **[تخمين الصندوق السري]**\nاختر صندوقاً:`, components: rows }).then(msg => {
        const coll = msg.createMessageComponentCollector({ time: 20000, max: 1 });
        coll.on('collect', async i => {
            activeGames.delete(channel.id);
            const chosen = parseInt(i.customId.replace('box_', ''));
            if (chosen === winningBox) {
                let eco = await getEconomyUser(guildId, i.user.id);
                eco.balance += 10000;
                await saveEconomyUser(guildId, i.user.id, eco);
                addPoints(guildId, i.user.id, i.user.displayName, channel);
                await i.update({ content: `👑 **مبروك كسبت $10,000 كاش** و **10 نقاط**! 🎉`, components: [] });
            } else {
                await i.update({ content: `💨 صندوق فاضي، هاردلك! 💀`, components: [] });
            }
        });
    });
}

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  const guildId = message.guild.id;
  const userId = message.author.id;

  lastActivityTime.set(message.channel.id, Date.now());

  if (message.content.startsWith('!مسح') || message.content.startsWith('!حذف')) {
      if (!message.member.permissions.has('ManageMessages')) return message.reply('❌ للإدارة فقط!');
      const count = parseInt(message.content.split(' ')[1]);
      if (isNaN(count) || count <= 0 || count > 100) return message.reply('❌ حدد عدد بين 1 و 100');
      try {
          await message.delete().catch(() => {});
          const fetched = await message.channel.messages.fetch({ limit: count });
          await message.channel.bulkDelete(fetched, true);
          const confirmMsg = await message.channel.send(`🧹 تم حذف **${fetched.size}** رسالة بنجاح!`);
          setTimeout(() => confirmMsg.delete().catch(() => {}), 4000);
      } catch (err) {}
      return;
  }

  if (allowedEconomyChannels.includes(message.channel.id)) {
      if (message.content === '!اقتصاد') {
          const embed = new EmbedBuilder().setColor('#2ecc71').setTitle('🏦 النظام الاقتصادي والمزايا الفخمة').addFields(
              { name: '💵 الأساسيات', value: '`!راتب` | `!بنك`', inline: false },
              { name: '👤 الهوية الشخصية', value: '`!هوية` أو `!هوية [@الشخص]`', inline: false },
              { name: '👔 الوظائف (20 وظيفة تدرجية)', value: '`!وظائف` | `!وظيفة [الرمز]`', inline: false },
              { name: '📈 السوق والأملاك', value: '`!سوق` | `!شراء [رقم]` | `!بيع [رقم]` | `!املاكي` | `!ارباح`', inline: false },
              { name: '🦹‍♂️ الجريمة والحظ', value: '`!سرقة [@الشخص]` | `!حظ [المبلغ]` | `!صندوق`', inline: false },
              { name: '🎯 المهام والتحويل', value: '`!مهامي` | `!تحويل [@الشخص] [المبلغ]`', inline: false },
              { name: '🏆 لوحة الصدارة', value: '`!ت` (لعرض لوحة الشرف بالأزرار التفاعلية)', inline: false }
          );
          return message.channel.send({ embeds: [embed] });
      }
      if (message.content === '!بنك' || message.content === '!ابنك') {
          const user = await getEconomyUser(guildId, userId);
          return message.reply(`💳 رصيدك الكاش بالسيرفر: **$${user.balance.toLocaleString()}** | وظيفتك: **${user.job}**`);
      }

      if (message.content === '!هوية' || message.content.startsWith('!هوية ')) {
          const targetUser = message.mentions.users.first() || message.author;
          const targetId = targetUser.id;
          const targetName = targetUser.displayName || targetUser.username;
          const ecoData = await getEconomyUser(guildId, targetId);
          const ptsData = await getPointsUser(guildId, targetId, targetName);
          const xpNeeded = (ptsData.level * ptsData.level) * 150;
          const profileEmbed = new EmbedBuilder()
              .setColor('#9B59B6')
              .setTitle(`👤 الهوية: ${targetName}`)
              .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
              .addFields(
                  { name: '💳 الرصيد المالي', value: `\`$${ecoData.balance.toLocaleString()}\``, inline: true },
                  { name: '👔 الوظيفة الحالية', value: `\`${ecoData.job}\``, inline: true },
                  { name: '⭐ رصيد النقاط', value: `\`${ptsData.points} نقطة\``, inline: true },
                  { name: '🚀 المستوى (Level)', value: `\`Level ${ptsData.level}\` (XP: ${ptsData.xp} / ${xpNeeded})`, inline: false },
                  { name: '🏠 عدد العقارات والأملاك', value: `\`${ecoData.properties.length} عقار\``, inline: true },
                  { name: '🔥 عدد الرسائل والتفاعل', value: `\`${ptsData.messagesCount} رسالة\``, inline: true }
              )
              .setTimestamp();
          return message.channel.send({ embeds: [profileEmbed] });
      }
      
      if (message.content === '!وظائف') {
          const embed = new EmbedBuilder().setColor('#3498DB').setTitle('👔 سلّم الوظائف في السيرفر (20 وظيفة)');
          let desc = '';
          for (let key in jobsList) {
              const j = jobsList[key];
              desc += `• **${j.name}** | الراتب: \`$${j.salary.toLocaleString()}\` | الشرط: \`Level ${j.level}\` (الرمز: \`${key}\`)\n`;
          }
          embed.setDescription(desc);
          return message.channel.send({ embeds: [embed] });
      }

      if (message.content.startsWith('!وظيفة')) {
          const jobKey = message.content.split(' ')[1];
          if (!jobKey || !jobsList[jobKey]) return message.reply('❌ يرجى إدخال رمز وظيفة صحيح!');
          const targetJob = jobsList[jobKey];
          let pUser = await getPointsUser(guildId, userId, message.author.displayName);
          if (pUser.level < targetJob.level) return message.reply(`⛔ مستواك الحالي Level ${pUser.level} يتطلب Level ${targetJob.level} لهذه الوظيفة!`);
          let user = await getEconomyUser(guildId, userId);
          user.job = targetJob.name;
          await saveEconomyUser(guildId, userId, user);
          return message.reply(`🎉 مبروك ترقيتك رسمياً في وظيفة **${user.job}**! 🎖️`);
      }

      if (message.content === '!راتب') {
          let user = await getEconomyUser(guildId, userId);
          const now = Date.now();
          if (user.lastWork && (now - user.lastWork < 5 * 60 * 1000)) return message.reply('⏳ باقي وقت على راتبك القادم.');
          let baseSalary = 500;
          for (let key in jobsList) { if (user.job === jobsList[key].name) { baseSalary = jobsList[key].salary; break; } }
          user.balance += baseSalary; user.lastWork = now;
          await saveEconomyUser(guildId, userId, user);
          return message.reply(`💵 تم إيداع راتبك (${user.job}) بقيمة **$${baseSalary.toLocaleString()}**!`);
      }

      if (message.content === '!سوق') {
          const embed = new EmbedBuilder().setColor('#0099ff').setTitle('📈 بورصة العقارات والأعمال');
          marketItems.forEach(i => embed.addFields({ name: `[${i.id}] ${i.emoji} ${i.name}`, value: `🏷️ \`${i.type}\`\n💰 **$${i.price.toLocaleString()}** | 💸 ربح: **$${i.profit.toLocaleString()}**`, inline: true }));
          embed.setFooter({ text: '💡 لشراء عقار: !شراء [رقم] | 🏷️ رسوم بيع العقار: استرداد 90%' });
          return message.channel.send({ embeds: [embed] });
      }

      if (message.content.startsWith('!شراء ')) {
          const id = parseInt(message.content.split(' ')[1]);
          const item = marketItems.find(i => i.id === id);
          if (!item) return message.reply('❌ رقم العقار خطأ!');
          let user = await getEconomyUser(guildId, userId);
          if (user.balance < item.price) return message.reply('💸 فلوسك ما تكفي!');
          user.balance -= item.price; user.properties.push(id);
          await saveEconomyUser(guildId, userId, user);
          return message.reply(`🎉 شريت **${item.name}** بـ **$${item.price.toLocaleString()}**!`);
      }

      if (message.content === '!املاكي') {
          const user = await getEconomyUser(guildId, userId);
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
          const indexToSell = parseInt(message.content.split(' ')[1]) - 1;
          let user = await getEconomyUser(guildId, userId);
          if (isNaN(indexToSell) || indexToSell < 0 || indexToSell >= user.properties.length) return message.reply('❌ رقم غير صحيح!');
          const item = marketItems.find(i => i.id === user.properties[indexToSell]);
          const sellPrice = Math.floor(item.price * 0.90);
          user.properties.splice(indexToSell, 1); user.balance += sellPrice;
          await saveEconomyUser(guildId, userId, user);
          return message.reply(`🤝 بعت **${item.name}** بـ **$${sellPrice.toLocaleString()}** (بعد خصم 10% رسوم).`);
      }

      if (message.content === '!ارباح') {
          let user = await getEconomyUser(guildId, userId);
          if (user.properties.length === 0) return message.reply('❌ ما عندك عقارات.');
          const now = Date.now();
          if (now - user.lastProfit < 5 * 60 * 1000) return message.reply('⏳ باقي وقت على الأرباح!');
          let total = 0; 
          user.properties.forEach(pid => { const i = marketItems.find(x => x.id === pid); if (i) total += i.profit; });
          user.balance += total; user.lastProfit = now;
          await saveEconomyUser(guildId, userId, user);
          return message.channel.send(`📈 تم استلام أرباح أملاكك بقيمة **$${total.toLocaleString()}**!`);
      }

      if (message.content.startsWith('!سرقة')) {
          const target = message.mentions.users.first();
          if (!target) return message.reply('❌ الاستخدام: `!سرقة [@الشخص]`');
          if (target.bot || target.id === userId) return message.reply('😅 ما تقدر تسرق نفسك أو بوت!');
          let user = await getEconomyUser(guildId, userId);
          const now = Date.now();
          if (user.lastCrime && (now - user.lastCrime < 10 * 60 * 1000)) return message.reply('🚓 الشرطة تراقبك!');
          let targetUser = await getEconomyUser(guildId, target.id);
          if (targetUser.balance < 500) return message.reply('💸 الضحية مفلس!');
          user.lastCrime = now;
          if (Math.random() < 0.45) {
              const stolen = Math.floor(targetUser.balance * 0.3) + 200;
              targetUser.balance -= stolen; user.balance += stolen;
              await saveEconomyUser(guildId, target.id, targetUser);
              await saveEconomyUser(guildId, userId, user);
              return message.channel.send(`🦹‍♂️ نجحت السرقة وسرقت **$${stolen.toLocaleString()}**! 💰`);
          } else {
              const fine = 300;
              user.balance = Math.max(0, user.balance - fine);
              await saveEconomyUser(guildId, userId, user);
              return message.channel.send(`🚨 صادَت الشرطة السارق وغرمته **$${fine}**! 🚔`);
          }
      }

      if (message.content.startsWith('!حظ')) {
          const amt = parseInt(message.content.split(' ')[1]);
          if (isNaN(amt) || amt <= 50) return message.reply('❌ أقل مبلغ للمراهنة 50!');
          let user = await getEconomyUser(guildId, userId);
          if (user.balance < amt) return message.reply('💸 رصيدك ما يكفي!');
          const roll = Math.random();
          if (roll < 0.40) { user.balance -= amt; message.reply(`😢 خسرت **$${amt.toLocaleString()}**!`); }
          else if (roll < 0.85) { user.balance += amt; message.reply(`🎰 فزت وضاعفت فلوسك **$${amt.toLocaleString()}**! 🎉`); }
          else { user.balance += amt * 3; message.channel.send(`👑 ضربت الحظ الكبرى وكسبت **$${(amt*3).toLocaleString()}**! 🔥`); }
          await saveEconomyUser(guildId, userId, user);
      }

      if (message.content === '!صندوق') {
          let user = await getEconomyUser(guildId, userId);
          if (user.balance < 3000) return message.reply('📦 سعر الصندوق 3,000!');
          user.balance -= 3000;
          const prizes = [1500, 5000, 12000, 0];
          const won = prizes[Math.floor(Math.random() * prizes.length)];
          if (won > 0) user.balance += won;
          await saveEconomyUser(guildId, userId, user);
          return message.reply(`📦 فتحت الصندوق وطلع لك: **$${won.toLocaleString()}**!`);
      }

      if (message.content === '!مهامي') {
          let user = await getEconomyUser(guildId, userId);
          const now = Date.now();
          if (user.lastQuest && (now - user.lastQuest < 24 * 60 * 60 * 1000)) return message.reply('⏳ أتممت مهام اليوم بالفعل!');
          user.lastQuest = now; user.balance += 5000;
          await saveEconomyUser(guildId, userId, user);
          return message.reply(`🎯 أتممت مهام اليوم وحصلت على **$5,000**!`);
      }
  }

  if (allowedChannels.includes(message.channel.id) || allowedEconomyChannels.includes(message.channel.id)) {
      if (allowedChannels.includes(message.channel.id)) trackUserMessage(guildId, userId, message.author.displayName, message.channel, message.member);

      if (message.content === '!فعالية' || message.content === '!لعبة') {
          if (activeGames.has(message.channel.id)) return message.reply('⏳ فيه لعبة شغالة!');
          const r = Math.floor(Math.random() * 12);
          if (r === 0) startBombGame(message.channel, guildId);
          else if (r === 1) startScrambleGame(message.channel, guildId);
          else if (r === 2) startButtonGame(message.channel, guildId);
          else if (r === 3) startMathGame(message.channel, guildId);
          else if (r === 4) startCapitalGame(message.channel, guildId);
          else if (r === 5) startReverseGame(message.channel, guildId);
          else if (r === 6) startTriviaGame(message.channel, guildId);
          else if (r === 7) startGuessGame(message.channel, guildId);
          else if (r === 8) startEmojiGame(message.channel, guildId);
          else if (r === 9) startMeaningGame(message.channel, guildId);
          else if (r === 10) startRPSGame(message, guildId);
          else startBoxesGame(message.channel, guildId, userId);
          return;
      }

      if (message.content === '!العاب') return sendGamesMenu(message.channel);

      if (message.content.startsWith('!حجر') || message.content.startsWith('حجر')) return startRPSGame(message, guildId);
      if (message.content.startsWith('!xo') || message.content.startsWith('xo')) return startXOGame(message, guildId);
      if (message.content.startsWith('!ذاكرة') || message.content.startsWith('ذاكرة') || message.content.startsWith('إذاكرة')) return startMemoryGame(message, guildId);
      if (message.content === '!صناديق' || message.content === 'صناديق') return startBoxesGame(message.channel, guildId, userId);
      if (message.content === '!قنبلة') startBombGame(message.channel, guildId);
      if (message.content === '!زر') startButtonGame(message.channel, guildId);
      if (message.content === '!كتابة') startWritingGame(message.channel, guildId);
      if (message.content === '!فكك') startScrambleGame(message.channel, guildId);
      if (message.content === '!رياضيات') startMathGame(message.channel, guildId);
      if (message.content === '!عواصم') startCapitalGame(message.channel, guildId);
      if (message.content === '!عكس') startReverseGame(message.channel, guildId);
      if (message.content === '!ذكاء') startTriviaGame(message.channel, guildId);
      if (message.content === '!تخمين') startGuessGame(message.channel, guildId);
      if (message.content === '!إيموجي') startEmojiGame(message.channel, guildId);
      if (message.content === '!معنى') startMeaningGame(message.channel, guildId);

      if (message.content === '!روليت') {
          if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!');
          activeGames.set(message.channel.id, 'roulette');
          setTimeout(() => {
              activeGames.delete(message.channel.id);
              if (Math.floor(Math.random() * 6) + 1 === 1) message.channel.send(`💥 **بووووم!** ${message.author} خسر 💀.`);
              else { message.channel.send(`😅 المسدس فاضي! كسبت **10 نقاط** يا ${message.author}.`); addPoints(guildId, userId, message.author.displayName, message.channel); }
          }, 3000);
      }

      if (message.content === '!ت') {
          if (!pointsColl || !economyColl) return message.reply('🏆 قاعدة البيانات غير متصلة.');
          const topPoints = await pointsColl.find({ guildId }).sort({ points: -1 }).limit(3).toArray();
          const topRich = await economyColl.find({ guildId }).sort({ balance: -1 }).limit(3).toArray();
          const embed = new EmbedBuilder().setColor('#FFD700').setTitle('🏆 لوحة صدارة السيرفر').setDescription(`**👑 أبطال النقاط:**\n${topPoints.map((d, i) => `${i+1}. ${d.name}: \`${d.points} نقطة\``).join('\n')}\n\n**💎 الأثرياء:**\n${topRich.map((d, i) => `${i+1}. <@${d.userId}>: \`$${d.balance.toLocaleString()}\``).join('\n')}`);
          return message.channel.send({ embeds: [embed] });
      }

      if (message.content === '!ايقاف') {
          activeGames.delete(message.channel.id);
          return message.channel.send('🛑 **تم إيقاف اللعبة الجارية بنجاح!**');
      }
  }
});

client.login(DISCORD_TOKEN);
