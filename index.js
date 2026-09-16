const { Client, GatewayIntentBits, ActivityType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
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

let db, pointsColl, economyColl, guildsColl, surveyColl;

async function connectDB() {
    try {
        await dbClient.connect();
        db = dbClient.db('camora_zone_db');
        pointsColl = db.collection('points');
        economyColl = db.collection('economy');
        guildsColl = db.collection('corporations'); 
        surveyColl = db.collection('surveys'); 
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
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ] 
});

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const activeGames = new Map(); 
const processingUsers = new Set(); 
const allowedChannels = ['1547728033580847236', '1547728346081927262', '1548010683692748821']; 
const allowedEconomyChannels = ['1547951432186077296', '1548010683692748821']; 
const allowedStockChannels = ['1549387597221068900', '1549387358343004220'];
const adminSurveyChannel = '1549507504457916546'; // روم الإدارة الخاص بك

const lastActivityTime = new Map();
const lastMarketMessages = new Map();
const lastStockMessages = new Map(); 

let marketNextUpdate = Date.now() + (5 * 60 * 1000);
let stockNextUpdate = Date.now() + (15 * 60 * 1000); 

let stockMarket = [
    { id: 'aapl', name: 'أبل (Apple)', price: 350, base: 350, trend: '➖', emoji: '🍏' },
    { id: 'tsla', name: 'تسلا (Tesla)', price: 620, base: 620, trend: '➖', emoji: '⚡' },
    { id: 'aramco', name: 'أرامكو السعودية', price: 180, base: 180, trend: '➖', emoji: '🛢️' },
    { id: 'btc', name: 'البيتكوين (Bitcoin)', price: 2500, base: 2500, trend: '➖', emoji: '🪙' },
    { id: 'nvidia', name: 'إنفيديا (Nvidia)', price: 900, base: 900, trend: '➖', emoji: '💻' },
    { id: 'goog', name: 'جوجل (Google)', price: 450, base: 450, trend: '➖', emoji: '🔍' },
    { id: 'amzn', name: 'أمازون (Amazon)', price: 510, base: 510, trend: '➖', emoji: '📦' },
    { id: 'msft', name: 'مايكروسوفت (Microsoft)', price: 780, base: 780, trend: '➖', emoji: '🪟' },
    { id: 'eth', name: 'الإيثيريوم (Ethereum)', price: 1200, base: 1200, trend: '➖', emoji: '💎' },
    { id: 'meta', name: 'ميتا (Meta)', price: 310, base: 310, trend: '➖', emoji: '🌐' },
    { id: 'NFLX', name: 'نتفليكس (Netflix)', price: 290, base: 290, trend: '➖', emoji: '🎬' },
    { id: 'SOL', name: 'سولانا (Solana)', price: 150, base: 150, trend: '➖', emoji: '☀️' }
];

let corpAssetsMarket = [
    { id: 101, name: 'مصنع تعبئة وتغليف', price: 40000, profit: 4000, emoji: '🏭' },
    { id: 102, name: 'أسطول شحن وتوصيل', price: 95000, profit: 10000, emoji: '🚚' },
    { id: 103, name: 'منصة تجارة إلكترونية', price: 220000, profit: 25000, emoji: '🌐' },
    { id: 104, name: 'برج تجاري استثماري', price: 600000, profit: 75000, emoji: '🏗️' }
];

setInterval(async () => {
    const eventRoll = Math.random();
    let eventTitle = '';
    let eventDesc = '';
    let color = '#9b59b6';
    let multiplier = 1;

    if (eventRoll < 0.35) {
        multiplier = 1.50;
        eventTitle = '🚀 طفرة اقتصادية كبرى للأسهم (Bull Market)!';
        eventDesc = '📈 **انتعاش عام في الأسواق العالمية!** ارتفعت جميع الأسهم بنسبة **50%**.';
        color = '#2ecc71';
    } else if (eventRoll > 0.70) {
        multiplier = 0.50;
        eventTitle = '💥 اليوم الأسود وانهيار السوق (Black Monday)!';
        eventDesc = '📉 **كارثة اقتصادية مفاجئة!** هبطت أسعار الأسهم بنسبة حادة.';
        color = '#e74c3c';
    } else {
        eventTitle = '📊 تحديث أسعار الأسهم العادي';
        eventDesc = '🔄 استمرار التذبذب الطبيعي في حركة الأسواق والأصول الرقمية.';
    }

    stockMarket.forEach(stock => {
        const oldP = stock.price;
        const change = (Math.random() * 0.40) - 0.18; 
        stock.price = Math.max(20, Math.floor(stock.price * (1 + change) * multiplier));
        
        if (stock.price > oldP) stock.trend = '📈';
        else if (stock.price < oldP) stock.trend = '📉';
        else stock.trend = '➖';
    });

    stockNextUpdate = Date.now() + (15 * 60 * 1000);

    const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(eventTitle)
        .setDescription(`${eventDesc}\n\nتأكد من فحص محفظتك عبر أمر \`!اسهم\`.`)
        .setTimestamp();

    for (const channelId of allowedStockChannels) {
        try {
            const channel = await client.channels.fetch(channelId);
            if (channel) {
                const oldMsgId = lastStockMessages.get(channelId);
                if (oldMsgId) {
                    try {
                        const oldMsg = await channel.messages.fetch(oldMsgId);
                        if (oldMsg) await oldMsg.delete();
                    } catch (e) {}
                }
                const newMsg = await channel.send({ embeds: [embed] });
                lastStockMessages.set(channelId, newMsg.id);
            }
        } catch (err) {}
    }
}, 3 * 60 * 60 * 1000);

setInterval(async () => {
    if (!guildsColl) return;
    try {
        const corps = await guildsColl.find({ assets: { $exists: true, $not: { $size: 0 } } }).toArray();
        for (const corp of corps) {
            let totalProfit = 0;
            corp.assets.forEach(assetId => {
                const assetItem = corpAssetsMarket.find(a => a.id === assetId);
                if (assetItem) totalProfit += assetItem.profit;
            });
            if (totalProfit > 0) {
                await guildsColl.updateOne({ _id: corp._id }, { $inc: { capital: totalProfit } });
            }
        }
    } catch (e) {}
}, 60 * 60 * 1000);

setInterval(async () => {
    if (!economyColl) return;
    try {
        const debtors = await economyColl.find({ loan: { $gt: 0 } }).toArray();
        for (const debtor of debtors) {
            const now = Date.now();
            if (debtor.loanDueDate && now > debtor.loanDueDate) {
                if (debtor.properties && debtor.properties.length > 0) {
                    const seizedPropId = debtor.properties.pop(); 
                    const seizedItem = marketItems.find(i => i.id === seizedPropId);
                    
                    debtor.loan = Math.max(0, debtor.loan - (seizedItem ? seizedItem.price : 5000));
                    await economyColl.updateOne({ guildId: debtor.guildId, userId: debtor.userId }, { $set: { balance: debtor.balance, properties: debtor.properties, loan: debtor.loan } });
                }
            }
        }
    } catch (e) {}
}, 60 * 60 * 1000);

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
    { id: 1, name: 'بسطة شاي جمر', type: 'مشروع صغير', basePrice: 2000, price: 2000, profit: 200, emoji: '🫖', trend: '➖' },
    { id: 2, name: 'ورشة سيارات', type: 'صيانة', basePrice: 15000, price: 15000, profit: 1500, emoji: '🔧', trend: '➖' },
    { id: 3, name: 'شقة مفروشة بالرياض', type: 'عقار', basePrice: 45000, price: 45000, profit: 4500, emoji: '🏢', trend: '➖' },
    { id: 4, name: 'تسالي', type: 'مطعم', basePrice: 85000, price: 85000, profit: 8500, emoji: '🍔', trend: '➖' },
    { id: 5, name: 'استراحة بالمجمعة', type: 'عقار', basePrice: 120000, price: 120000, profit: 12000, emoji: '🏕️', trend: '➖' },
    { id: 6, name: 'معرض سيارات فخمة', type: 'معرض', basePrice: 350000, price: 350000, profit: 35000, emoji: '🏎️', trend: '➖' },
    { id: 7, name: 'برج تجاري ضخم', type: 'عقار', basePrice: 1000000, price: 1000000, profit: 100000, emoji: '🏗️', trend: '➖' },
    { id: 8, name: 'بوفية ليالي الشرقية', type: 'مشروع صغير', basePrice: 5000, price: 5000, profit: 550, emoji: '🥪', trend: '➖' },
    { id: 9, name: 'بوفية السعادة', type: 'مشروع صغير', basePrice: 3500, price: 3500, profit: 450, emoji: '🍳', trend: '➖' },
    { id: 10, name: 'استراحة بالرماح', type: 'عقار', basePrice: 100000, price: 100000, profit: 10000, emoji: '🏕️', trend: '➖' },
    { id: 11, name: 'اجدان ووك', type: 'مشروع كبير', basePrice: 1250000, price: 1250000, profit: 125000, emoji: '🏙️', trend: '➖' },
    { id: 12, name: 'فرنش شايز كيان', type: 'مشروع صغير', basePrice: 7500, price: 7500, profit: 750, emoji: '🥤', trend: '➖' },
    { id: 13, name: 'مطعم فلفل', type: 'مشروع كبير', basePrice: 2500000, price: 2500000, profit: 250000, emoji: '🌶️', trend: '➖' },
    { id: 14, name: 'بوفية صلاح', type: 'مشروع صغير', basePrice: 4500, price: 4500, profit: 450, emoji: '🥪', trend: '➖' }
];

setInterval(async () => {
    const propEventRoll = Math.random();
    let propEventTitle = '';
    let propEventDesc = '';
    let propColor = '#3498DB';
    let propMultiplier = 1;

    if (propEventRoll < 0.30) {
        propMultiplier = 1.50;
        propEventTitle = '🚀 طفرة عقارية كبرى (Real Estate Boom)!';
        propEventDesc = '📈 **انتعاش هائل في سوق العقارات والأراضي!** ارتفعت قيمة جميع العقارات والأرباح بنسبة **50%**.';
        propColor = '#2ECC71';
    } else if (propEventRoll > 0.75) {
        propMultiplier = 0.60;
        propEventTitle = '🏚️ ركود وهبوط عقاري مفاجئ (Real Estate Crash)!';
        propEventDesc = '📉 **أزمة سيولة تضرب سوق العقارات!** هبطت أسعار وقيم العقارات بشدة.';
        propColor = '#E74C3C';
    } else {
        propEventTitle = '📈 تحديث أسعار العقارات والأعمال';
        propEventDesc = '🔄 استمرار التذبذب الطبيعي في حركة سوق العقارات والمشاريع.';
    }

    marketItems.forEach(item => {
        const oldPrice = item.price;
        const randomPercent = (Math.random() * 0.50) - 0.20; 
        let newPrice = Math.floor(item.basePrice * (1 + randomPercent) * propMultiplier);
        if (newPrice < Math.floor(item.basePrice * 0.4)) newPrice = Math.floor(item.basePrice * 0.4);
        
        item.price = newPrice;
        item.profit = Math.floor(item.price * 0.10);

        if (item.price > oldPrice) item.trend = '📈';
        else if (item.price < oldPrice) item.trend = '📉';
        else item.trend = '➖';
    });

    marketNextUpdate = Date.now() + (5 * 60 * 1000);

    const embed = new EmbedBuilder()
        .setColor(propColor)
        .setTitle(propEventTitle)
        .setDescription(`${propEventDesc}\n\n🔄 **تم تجديد وتحديث أسعار وأرباح السوق الآن!**`)
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
        } catch (err) {}
    }
}, 5 * 60 * 1000);

async function getEconomyUser(guildId, userId) {
    if (!economyColl) return { guildId, userId, balance: 1500, properties: [], job: 'مواطن 🇸🇦', lastWork: 0, lastProfit: 0, lastCrime: 0, lastQuest: 0, questsCompleted: 0, lastBox: 0, loan: 0, guard: false, guardShields: 0, loanDueDate: 0 };
    let doc = await economyColl.findOne({ guildId, userId });
    if (!doc) {
        doc = { guildId, userId, balance: 1500, properties: [], job: 'مواطن 🇸🇦', lastWork: 0, lastProfit: 0, lastCrime: 0, lastQuest: 0, questsCompleted: 0, lastBox: 0, loan: 0, guard: false, guardShields: 0, loanDueDate: 0 };
        await economyColl.insertOne(doc);
    }
    if (!doc.job) doc.job = 'مواطن 🇸🇦';
    if (doc.loan === undefined) doc.loan = 0;
    if (doc.guard === undefined) doc.guard = false;
    if (doc.guardShields === undefined) doc.guardShields = 0;
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
    } catch (e) {}
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
    await pointsColl.updateOne({ guildId: guildId, userId: userId }, { $set: doc }, { upsert: true });
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
                try { await member.roles.add(role); } catch (e) {}
            }
        }
    }

    await pointsColl.updateOne({ guildId: guildId, userId: userId }, { $set: doc }, { upsert: true });
}

async function checkAndDistributeAutoRoles(guild) {
    // دالة وهمية لتجنب خطأ عدم التعريف للرتب التلقائية
}

// دوال الألعاب الكاملة
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

const emojiMasterPool = [{ e: '🚗💨', ans: 'سيارة' }, { e: '🍎🍏', ans: 'تفاح' }, { e: '⚽🏃‍♂️', ans: 'كرة قدم' }, { e: '🦁👑', ans: 'اسد' }, { e: '💻⚡', ans: 'حاسب' }, { e: '✈️🌍', ans: 'طائرة' }, { e: '🍕🧀', ans: 'بيتزا' }, { e: '🔥🚒', ans: 'اطفاء' }, { e: '👑💎', ans: 'تاج' }, { e: '🌙⭐', ans: 'ليل' }, { e: '☕️📖', ans: 'قهوة' }, { e: '🐱🐟', ans: 'قطة' }, { e: '🌊🏄‍♂️', ans: 'بحر' }, { e: '🍌🐒', ans: 'موز' }, { e: '🚀🌌', ans: 'فضاء' }, { e: '📸✨', ans: 'كاميرا' }, { e: '🍔🥤', ans: 'وجبة' }, { e: '🎧🎶', ans: 'سماعة' }, { e: '⚽🏆', ans: 'بطولة' }, { e: '💡🧠', ans: 'فكرة' }];
const meaningMasterPool = [{ word: 'قشيب', desc: 'ثوب جديد نظيف' }, { word: 'اليم', desc: 'البحر' }, { word: 'وجيز', desc: 'مختصر' }, { word: 'باسق', desc: 'طويل وعالي' }, { word: 'صنديد', desc: 'شجاع قوي' }, { word: 'هوجاء', desc: 'ريح شديدة' }, { word: 'رغد', desc: 'عيش طيب واسع' }, { word: 'وثيق', desc: 'مؤكد قوي' }];
const scrambleMasterPool = ['برمجة', 'ديسكورد', 'حاسب', 'مهندس', 'تطوير', 'تقنية', 'سيرفر', 'ذكاء', 'معلومات', 'استثمار', 'استراحه', 'سيارات', 'جامعة', 'عقارات', 'تطبيقات', 'مليارات', 'مسابقات', 'محطات'];
const triviaMasterPool = [{ q: 'ما هو أكبر كوكب في المجموعة الشمسية؟', ans: 'المشتري' }, { q: 'كم عدد سور القرآن الكريم؟', ans: '114' }, { q: 'ما هي عاصمة أستراليا؟', ans: 'كانبرا' }, { q: 'من هو أول خلفاء المسلمين؟', ans: 'ابو بكر' }, { q: 'ما هي عاصمة اليابان؟', ans: 'طوكيو' }, { q: 'في أي سنة هبط الإنسان على القمر؟', ans: '1969' }, { q: 'ما هي عاصمة المملكة العربية السعودية؟', ans: 'الرياض' }, { q: 'كم عدد أركان الإسلام؟', ans: '5' }];
const capitalMasterPool = [{ c: 'السعودية', cap: 'الرياض' }, { c: 'الإمارات', cap: 'ابوظبي' }, { c: 'الكويت', cap: 'الكويت' }, { c: 'مصر', cap: 'القاهرة' }, { c: 'قطر', cap: 'الدوحة' }, { c: 'عمان', cap: 'مسقط' }, { c: 'البحرين', cap: 'المنامة' }, { c: 'الأردن', cap: 'عمان' }];

function sendGamesMenu(channel) {
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🎮 قائمة ألعاب وقوائم 𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞')
        .addFields(
            { name: '🔪 الألعاب اليدوية والفعاليات', value: '`!xo [@شخص]` | `!حجر [@شخص]` | `!روليت` | `!قنبلة` | `!فكك` | `!عكس` | `!إيموجي` | `!معنى` | `!تخمين` | `!ذكاء` | `!رياضيات` | `!عواصم` | `!زر` | `!كتابة`', inline: false },
            { name: '🧠 لعبة الذاكرة (مستويات)', value: '`!ذاكرة سهل` | `!ذاكرة متوسط` | `!ذاكرة صعب`', inline: false },
            { name: '⚡ الألعاب التفاعلية والفخمة', value: '`!بلنتي` | `!ألغام` | `!سباق` | `!خزنة` | `!صناديق`', inline: false },
            { name: '🏆 لوحة الصدارة', value: '`!ت`', inline: false }
        )
        .setFooter({ text: '🛑 لإلغاء أي لعبة جارية اكتب: !ايقاف' });

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_xo').setLabel('❌ XO').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_rps').setLabel('🪨 حجر ورقة مقص').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('btn_bomb').setLabel('💣 قنبلة').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('btn_roulette').setLabel('🔫 روليت').setStyle(ButtonStyle.Danger)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_scramble').setLabel('🧩 فكك').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_reverse').setLabel('🔄 عكس').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_emoji').setLabel('😀 إيموجي').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_trivia').setLabel('🧠 ذكاء').setStyle(ButtonStyle.Secondary)
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_penalty').setLabel('⚽ بلنتي').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_mines').setLabel('⚠️ ألغام').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_race').setLabel('🏎️ سباق').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('btn_vault').setLabel('🏦 خزنة').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('btn_boxes').setLabel('📦 صناديق').setStyle(ButtonStyle.Success)
    );

    channel.send({ embeds: [embed], components: [row1, row2, row3] });
}

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
            await i.deferUpdate().catch(()=>{});
            activeGames.delete(channel.id);
            if (i.customId === safe) {
                await msg.edit({ content: `🎉 **كفو ${i.user}!** فكيت القنبلة وكسبت **10 نقاط**! 💣✨`, components: [] }).catch(()=>{});
                addPoints(guildId, i.user.id, i.user.displayName, channel);
            } else {
                await msg.edit({ content: `💥 **بوووم!** قطعت السلك الخطأ يا ${i.user} وانفجرت 💀`, components: [] }).catch(()=>{});
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
    const a = Math.floor(Math.random() * 50) + 1;
    const b = Math.floor(Math.random() * 50) + 1;
    const ans = (a + b).toString();
    channel.send(`🔢 **[رياضيات]** كم ناتج: \`${a} + ${b}\` ؟`).then(() => {
        const filter = m => m.content === ans;
        const coll = channel.createMessageCollector({ filter, time: 15000, max: 1 });
        activeGames.set(channel.id, coll);
        coll.on('collect', m => { 
            activeGames.delete(channel.id); 
            m.reply(`🎉 صح عليك! الجواب هو **${ans}**!`);
            addPoints(guildId, m.author.id, m.author.displayName, channel); 
        });
        coll.on('end', (_, r) => { if (r === 'time') { activeGames.delete(channel.id); channel.send(`⏰ انتهى الوقت! الإجابة كانت: **${ans}**`); } });
    });
}

function startCapitalGame(channel, guildId) {
    if (activeGames.has(channel.id)) return;
    const chosen = getUniqueRandomItem(capitalMasterPool, 'capital', 'c');
    channel.send(`🌍 **[عواصم]** وش عاصمة **${chosen.c}** ؟`).then(() => {
        const filter = m => m.content.includes(chosen.cap);
        const coll = channel.createMessageCollector({ filter, time: 15000, max: 1 });
        activeGames.set(channel.id, coll);
        coll.on('collect', m => { 
            activeGames.delete(channel.id); 
            m.reply(`🎉 بطل! العاصمة هي **${chosen.cap}**!`);
            addPoints(guildId, m.author.id, m.author.displayName, channel); 
        });
        coll.on('end', (_, r) => { if (r === 'time') { activeGames.delete(channel.id); channel.send(`⏰ انتهى الوقت! الإجابة كانت: **${chosen.cap}**`); } });
    });
}

function startReverseGame(channel, guildId) {
    if (activeGames.has(channel.id)) return;
    const words = ['سيرفر', 'ديسكورد', 'حاسب', 'مبرمج', 'بوت', 'نظام'];
    const word = words[Math.floor(Math.random() * words.length)];
    const reversed = word.split('').reverse().join('');
    channel.send(`🔄 **[عكس]** اكتب الكلمة التالية بالعكس: \`${word}\``).then(() => {
        const filter = m => m.content === reversed;
        const coll = channel.createMessageCollector({ filter, time: 15000, max: 1 });
        activeGames.set(channel.id, coll);
        coll.on('collect', m => { 
            activeGames.delete(channel.id); 
            m.reply(`🎉 كفو! العكس الصحيح هو **${reversed}**!`);
            addPoints(guildId, m.author.id, m.author.displayName, channel); 
        });
        coll.on('end', (_, r) => { if (r === 'time') { activeGames.delete(channel.id); channel.send(`⏰ انتهى الوقت! الإجابة كانت: **${reversed}**`); } });
    });
}

function startTriviaGame(channel, guildId) {
    if (activeGames.has(channel.id)) return;
    const chosen = getUniqueRandomItem(triviaMasterPool, 'trivia', 'q');
    channel.send(`🧠 **[ذكاء]** ${chosen.q}`).then(() => {
        const filter = m => m.content.includes(chosen.ans);
        const coll = channel.createMessageCollector({ filter, time: 20000, max: 1 });
        activeGames.set(channel.id, coll);
        coll.on('collect', m => { 
            activeGames.delete(channel.id); 
            m.reply(`🎉 ذيبان! الإجابة الصح هي **${chosen.ans}**!`);
            addPoints(guildId, m.author.id, m.author.displayName, channel); 
        });
        coll.on('end', (_, r) => { if (r === 'time') { activeGames.delete(channel.id); channel.send(`⏰ انتهى الوقت! الإجابة كانت: **${chosen.ans}**`); } });
    });
}

function startGuessGame(channel, guildId) {
    if (activeGames.has(channel.id)) return;
    const ans = Math.floor(Math.random() * 15) + 1;
    channel.send(`❓ **[تخمين]** خمن رقم من 1 إلى 15!`).then(() => {
        const filter = m => parseInt(m.content) === ans;
        const coll = channel.createMessageCollector({ filter, time: 15000, max: 1 });
        activeGames.set(channel.id, coll);
        coll.on('collect', m => { 
            activeGames.delete(channel.id); 
            m.reply(`🎉 جبتها! الرقم هو **${ans}**!`);
            addPoints(guildId, m.author.id, m.author.displayName, channel); 
        });
        coll.on('end', (_, r) => { if (r === 'time') { activeGames.delete(channel.id); channel.send(`⏰ انتهى الوقت! الرقم كان: **${ans}**`); } });
    });
}

function startMeaningGame(channel, guildId) {
    if (activeGames.has(channel.id)) return;
    const chosen = getUniqueRandomItem(meaningMasterPool, 'meaning', 'word');
    channel.send(`📖 **[معنى]** وش معنى كلمة: \`${chosen.word}\`؟\n*(اكتب كلمة مفتاحية من المعنى)*`).then(() => {
        const filter = m => m.content.includes(chosen.desc.split(' ')[0]);
        const coll = channel.createMessageCollector({ filter, time: 20000, max: 1 });
        activeGames.set(channel.id, coll);
        coll.on('collect', m => { 
            activeGames.delete(channel.id); 
            m.reply(`🎉 كفو! المعنى هو: **${chosen.desc}**!`);
            addPoints(guildId, m.author.id, m.author.displayName, channel); 
        });
        coll.on('end', (_, r) => { if (r === 'time') { activeGames.delete(channel.id); channel.send(`⏰ انتهى الوقت! المعنى كان: **${chosen.desc}**`); } });
    });
}

function startPenaltyGame(channel, guildId) {
    if (activeGames.has(channel.id)) return;
    activeGames.set(channel.id, 'penalty');
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('left').setLabel('يسار ⬅️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('center').setLabel('وسط ⬆️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('right').setLabel('يمين ➡️').setStyle(ButtonStyle.Primary)
    );
    channel.send({ content: `⚽ **[بلنتي]** الشوتة مصيرية! اختر زاوية تشوت فيها:`, components: [row] }).then(msg => {
        const coll = msg.createMessageComponentCollector({ time: 10000, max: 1 });
        coll.on('collect', i => {
            activeGames.delete(channel.id); i.deferUpdate();
            const goalie = ['left', 'center', 'right'][Math.floor(Math.random()*3)];
            if(i.customId !== goalie) { 
                msg.edit({content:`قووووووول! ⚽🔥 الحارس طار زاوية ثانية وكسبت يا ${i.user}!`, components:[]}); 
                addPoints(guildId, i.user.id, i.user.displayName, channel); 
            } else { 
                msg.edit({content:`صدها الحارس! 🧤 طار معاك بالكورة وضاعت يا ${i.user}!`, components:[]}); 
            }
        });
        coll.on('end', (_, r) => { if (r === 'time') { activeGames.delete(channel.id); msg.edit({ content: `⏰ ضيعت الوقت والحكم صفر الكورة!`, components: [] }).catch(()=>{}); } });
    });
}

function startMinesGame(channel, guildId, userId) {
    if (activeGames.has(channel.id)) return;
    activeGames.set(channel.id, 'mines');
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('1').setLabel('🟩').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('2').setLabel('🟩').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('3').setLabel('🟩').setStyle(ButtonStyle.Secondary)
    );
    const bomb = Math.floor(Math.random() * 3) + 1;
    channel.send({ content: `⚠️ **[ألغام]** واحد من هالمربعات فيه لغم، اختر مربع آمن!`, components: [row] }).then(msg => {
        const coll = msg.createMessageComponentCollector({ time: 10000, max: 1 });
        coll.on('collect', i => {
            activeGames.delete(channel.id); i.deferUpdate();
            if(parseInt(i.customId) !== bomb) { 
                msg.edit({content:`سليم! ✅ اخترت صح وكسبت النقاط يا ${i.user}!`, components:[]}); 
                addPoints(guildId, i.user.id, i.user.displayName, channel); 
            } else { 
                msg.edit({content:`💥 بوووم! دعست اللغم يا ${i.user}!`, components:[]}); 
            }
        });
        coll.on('end', (_, r) => { if (r === 'time') { activeGames.delete(channel.id); msg.edit({ content: `⏰ انتهى الوقت وما اخترت!`, components: [] }).catch(()=>{}); } });
    });
}

function startRaceGame(channel, guildId, userId) {
    if (activeGames.has(channel.id)) return;
    activeGames.set(channel.id, 'race');
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('r1').setLabel('سيارة 1 🏎️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('r2').setLabel('سيارة 2 🚙').setStyle(ButtonStyle.Primary)
    );
    channel.send({ content: `🏁 **[سباق]** راهن على سيارة تتوقع تفوز!`, components: [row] }).then(msg => {
        const coll = msg.createMessageComponentCollector({ time: 10000, max: 1 });
        coll.on('collect', i => {
            activeGames.delete(channel.id); i.deferUpdate();
            const winner = Math.random() > 0.5 ? 'r1' : 'r2';
            if(i.customId === winner) { 
                msg.edit({content:`🏆 سيارتك فازت بالسباق! كفو يا ${i.user}`, components:[]}); 
                addPoints(guildId, i.user.id, i.user.displayName, channel); 
            } else { 
                msg.edit({content:`❌ خسرت السباق، سيارتك خبطت يا ${i.user}`, components:[]}); 
            }
        });
        coll.on('end', (_, r) => { if (r === 'time') { activeGames.delete(channel.id); msg.edit({ content: `⏰ انتهى الوقت!`, components: [] }).catch(()=>{}); } });
    });
}

function startVaultGame(channel, guildId, userId) {
    if (activeGames.has(channel.id)) return;
    const code = Math.floor(100 + Math.random() * 900); // رقم من 3 خانات
    channel.send(`🏦 **[خزنة]** الخزنة مقفلة برقم سري من 3 خانات (بين 100 و 999)! وش تتوقع الرقم؟`).then(() => {
        const filter = m => parseInt(m.content) === code;
        const coll = channel.createMessageCollector({ filter, time: 20000, max: 1 });
        activeGames.set(channel.id, coll);
        coll.on('collect', m => { 
            activeGames.delete(channel.id); 
            m.reply(`🔓 فتحت الخزنة! كفو يا ${m.author}!`);
            addPoints(guildId, m.author.id, m.author.displayName, channel); 
        });
        coll.on('end', (_, r) => { if (r === 'time') { activeGames.delete(channel.id); channel.send(`⏰ انتهى الوقت! الرقم السري كان: **${code}**`); } });
    });
}

function startBoxesGame(channel, guildId, userId) {
    if (activeGames.has(channel.id)) return;
    activeGames.set(channel.id, 'boxes');
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('1').setLabel('📦').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('2').setLabel('📦').setStyle(ButtonStyle.Secondary)
    );
    const gold = Math.floor(Math.random() * 2) + 1;
    channel.send({ content: `🎁 **[صناديق]** فيه كنز مخفي بصندوق واحد بس، اختار!`, components: [row] }).then(msg => {
        const coll = msg.createMessageComponentCollector({ time: 10000, max: 1 });
        coll.on('collect', i => {
            activeGames.delete(channel.id); i.deferUpdate();
            if(parseInt(i.customId) === gold) { 
                msg.edit({content:`💎 أسطورة! لقيت الكنز يا ${i.user}!`, components:[]}); 
                addPoints(guildId, i.user.id, i.user.displayName, channel); 
            } else { 
                msg.edit({content:`🕸️ للأسف الصندوق فاضي وفيه غبار يا ${i.user}`, components:[]}); 
            }
        });
        coll.on('end', (_, r) => { if (r === 'time') { activeGames.delete(channel.id); msg.edit({ content: `⏰ انتهى الوقت!`, components: [] }).catch(()=>{}); } });
    });
}

function startButtonGame(channel, guildId) {
    if (activeGames.has(channel.id)) return;
    activeGames.set(channel.id, 'btn');
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('fast').setLabel('أسرع واحد يضغط! ⚡').setStyle(ButtonStyle.Success));
    channel.send({ content: `🔘 **[زر]** اضغط الزر بسرعة قبل غيرك!`, components: [row] }).then(msg => {
        const coll = msg.createMessageComponentCollector({ time: 10000, max: 1 });
        coll.on('collect', i => { 
            activeGames.delete(channel.id); i.deferUpdate(); 
            msg.edit({content:`⚡ ${i.user} كان الأسرع وضغط الزر أول واحد!`, components:[]}); 
            addPoints(guildId, i.user.id, i.user.displayName, channel); 
        });
        coll.on('end', (_, r) => { if (r === 'time') { activeGames.delete(channel.id); msg.edit({ content: `⏰ انتهى الوقت ومحد ضغط!`, components: [] }).catch(()=>{}); } });
    });
}

client.once('clientReady', () => {
  console.log(`[BOT STATUS] Camora Zone is Online & Secured with MongoDB Atlas! 🚀`);
  client.user.setActivity('𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞', { type: ActivityType.Playing });
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  
  // دعم الأوامر في الخاص عن طريق إعطائه هوية افتراضية DM_CHANNEL
  const guildId = message.guild?.id || 'DM_CHANNEL';
  const userId = message.author.id;

  if (message.channel.type !== 1) { // 1 = Direct Message
      lastActivityTime.set(message.channel.id, Date.now());
  }

  if (message.content.startsWith('!مسح') || message.content.startsWith('!حذف')) {
      if (!message.member?.permissions.has('ManageMessages')) return message.reply('❌ للإدارة فقط!');
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

  // --- أمر الصيانة الشامل ---
  if (message.content === '!صيانه' || message.content === '!صيانة') {
      if (message.channel.id !== adminSurveyChannel) return message.reply('❌ هذا الأمر مخصص للاستخدام في روم الإدارة فقط!');
      try {
          await message.delete().catch(() => {});
          const statusMsg = await message.channel.send('⏳ **جاري إرسال إعلان الصيانة لجميع رومات الألعاب والاقتصاد...**');

          const embed = new EmbedBuilder()
              .setColor('#FF8C00')
              .setTitle('🛠️ إعلان صيانة وتطوير شامل في 𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞 🚀')
              .setDescription(
                  '**أهلاً بكم يا أبطال مجتمعنا! 🎮🔥**\n\n' +
                  'نعتذر منكم، السيرفر والبوت حالياً في **وضع الصيانة المؤقتة** 🚧.\n' +
                  'الإدارة جالسة تطبخ لكم تحديثات ضخمة، ألعاب جديدة، وميزات بتولع النظام الاقتصادي! 💸\n\n' +
                  '⏳ **الرجاء الانتظار، بنرجع أقوى مما كنا قريباً جداً...**\n' +
                  '> *(جميع الأنظمة مثل الاقتصاد، الأسهم، والألعاب متوقفة مؤقتاً لحين الانتهاء)* 🛑'
              )
              .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
              .setFooter({ text: 'إدارة 𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞 • شكراً لتفهمكم وصبركم ❤️' })
              .setTimestamp();

          const targetChannels = [...new Set([...allowedChannels, ...allowedEconomyChannels, ...allowedStockChannels])];
          let sentCount = 0;
          for (const chId of targetChannels) { 
              try { 
                  const channel = await client.channels.fetch(chId); 
                  if (channel) { 
                      await channel.send({ embeds: [embed] }); 
                      sentCount++; 
                  } 
              } catch (e) {} 
          }
          await statusMsg.edit(`✅ **تم الانتهاء!** تم إرسال إعلان الصيانة إلى **${sentCount}** روم بنجاح! 🛠️🚀`).catch(()=>{});
          return;
      } catch (err) { console.error(err); return message.channel.send('❌ حدث خطأ أثناء إرسال إعلان الصيانة.'); }
  }

  // --- أمر انتهاء الصيانة ---
  if (message.content === '!انتهاء-الصيانه' || message.content === '!انتهاء-الصيانة') {
      if (message.channel.id !== adminSurveyChannel) return message.reply('❌ هذا الأمر مخصص للاستخدام في روم الإدارة فقط!');
      try {
          await message.delete().catch(() => {});
          const statusMsg = await message.channel.send('⏳ **جاري إرسال إعلان انتهاء الصيانة لجميع الرومات...**');

          const embed = new EmbedBuilder()
              .setColor('#2ECC71')
              .setTitle('✅ تم الانتهاء من الصيانة وتحديث 𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞 🚀')
              .setDescription(
                  '**أهلاً بكم من جديد يا أبطال! 🎉🎮**\n\n' +
                  'أبشركم، انتهينا من الصيانة والتحديثات، والسيرفر رجع **أقوى من أول** وبكامل طاقته! 💪\n' +
                  'جميع الأنظمة (الاقتصاد 💸، الأسهم 📈، الألعاب 🎲، والشركات 🏢) رجعت تشتغل الآن بكل كفاءة وسرعة.\n\n' +
                  '🔥 **انطلقوا وكملوا لعبكم وتجارتكم، فالكم التوفيق!**'
              )
              .setThumbnail(client.user.displayAvatarURL({ dynamic: true }))
              .setFooter({ text: 'إدارة 𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞 • نتمنى لكم وقتاً ممتعاً ❤️' })
              .setTimestamp();

          const targetChannels = [...new Set([...allowedChannels, ...allowedEconomyChannels, ...allowedStockChannels])];
          let sentCount = 0;
          for (const chId of targetChannels) { 
              try { 
                  const channel = await client.channels.fetch(chId); 
                  if (channel) { 
                      await channel.send({ embeds: [embed] }); 
                      sentCount++; 
                  } 
              } catch (e) {} 
          }
          await statusMsg.edit(`✅ **تم الانتهاء!** تم إرسال إعلان عودة السيرفر للعمل إلى **${sentCount}** روم بنجاح! 🟢🚀`).catch(()=>{});
          return;
      } catch (err) { console.error(err); return message.channel.send('❌ حدث خطأ.'); }
  }

  // --- أمر تجربة الاستبيان على نفسك وحدك ---
  if (message.content === '!تجربة-استبيان') {
      if (message.channel.id !== adminSurveyChannel) {
          return message.reply('❌ هذا الأمر مخصص للاستخدام في روم الإدارة الخاص بك فقط!');
      }

      try {
          await message.delete().catch(() => {});

          const embed = new EmbedBuilder()
              .setColor('#5865F2')
              .setTitle('📢 إعلان هام وتطويري في 𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞 🚀')
              .setDescription(
                  'أهلاً بك في مجتمعنا اعرف اننا قروشناك ولكن تحملنا شوي! 🎮🔥\n\n' +
                  'إذا توك ما جربت ألعاب السيرفر، نظام الاقتصاد، العقارات، والأسهم.. فاتك الكثير! نحن نعمل حالياً على **تطوير تحديث ضخم** لسيرفرنا، ورأيك أنت تحديداً يهمنا جداً سواء كنت مجرب الألعاب أو جديد معنا.\n\n' +
                  '📋 **شاركنا رأيك عبر استبياننا السريع (10 أسئلة ممتعة + مساحة لاقتراحاتك):**\n' +
                  'اضغط على الزر أدناه لبدء الاستبيان على الخاص مباشرة ولا تنسَ تعطيني رأيك بكل صراحة! 💡'
              )
              .setFooter({ text: '𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞 • نظام تطوير السيرفر وتقييم اللاعبين' })
              .setTimestamp();

          const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('start_survey_btn').setLabel('🚀 شارك في الاستبيان الآن').setStyle(ButtonStyle.Success)
          );

          await message.author.send({ embeds: [embed], components: [row] });
          return message.channel.send(`✅ **أرسلت لك رسالة التجربة على الخاص يا أحمد!** شيك على محادثتك مع البوت. 🚀`).then(msg => {
              setTimeout(() => msg.delete().catch(()=>{}), 5000);
          });
      } catch (err) {
          console.error(err);
          return message.reply('❌ ما قدرت أرسل لك رسالة على الخاص، تأكد أن رسائلك الخاصة مفتوحة من البوت.');
      }
  }
    
// --- إعلان استطلاع الرأي الشامل (لكل الأعضاء مع تخطي حماية ديسكورد) ---
  if (message.content === '!ارسل-استبيان') {
      if (message.channel.id !== adminSurveyChannel) {
          return message.reply('❌ هذا الأمر مخصص للاستخدام في روم الإدارة الخاص بك فقط!');
      }

      try {
          await message.delete().catch(() => {});

          const statusMsg = await message.channel.send('⏳ **جاري إرسال إعلان الاستبيان على الخاص للأعضاء بالخلفية... (العملية هادئة لتجنب حظر ديسكورد)**');

          const embed = new EmbedBuilder()
              .setColor('#5865F2')
              .setTitle('📢 إعلان هام وتطويري في 𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞 🚀')
              .setDescription(
                  'أهلاً بك في مجتمعنا اعرف اننا قروشناك ولكن تحملنا شوي! 🎮🔥\n\n' +
                  'إذا توك ما جربت ألعاب السيرفر، نظام الاقتصاد، العقارات، والأسهم.. فاتك الكثير! نحن نعمل حالياً على **تطوير تحديث ضخم** لسيرفرنا، ورأيك أنت تحديداً يهمنا جداً سواء كنت مجرب الألعاب أو جديد معنا.\n\n' +
                  '📋 **شاركنا رأيك عبر استبياننا السريع (10 أسئلة ممتعة + مساحة لاقتراحاتك):**\n' +
                  'اضغط على الزر أدناه لبدء الاستبيان على الخاص مباشرة ولا تنسَ تعطيني رأيك بكل صراحة! 💡'
              )
              .setFooter({ text: '𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞 • نظام تطوير السيرفر وتقييم اللاعبين' })
              .setTimestamp();

          const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('start_survey_btn').setLabel('🚀 شارك في الاستبيان الآن').setStyle(ButtonStyle.Success)
          );

          await message.guild.members.fetch();
          let sentCount = 0;

          // تشغيل العملية في الخلفية بذكاء
          (async () => {
              for (const member of message.guild.members.cache.values()) {
                  if (member.user.bot) continue; // يتخطى البوتات
                  try {
                      await member.send({ embeds: [embed], components: [row] });
                      sentCount++;
                      // تأخير زمني 2.5 ثانية لتجنب السبام وحظر ديسكورد (Rate Limit)
                      await new Promise(resolve => setTimeout(resolve, 2500)); 
                  } catch (e) {
                      // إذا الشخص مقفل الخاص، يتخطاه بدون ما يوقف العملية
                  }
              }
              // بعد ما يخلص السيرفر كله، يعدل رسالته ويعطيك العدد النهائي
              await statusMsg.edit(`✅ **تم الانتهاء!** تم إرسال إعلان الاستبيان على الخاص لـ **${sentCount}** عضو في السيرفر بنجاح! 🚀`).catch(()=>{});
          })();

          return;
      } catch (err) {
          console.error(err);
          return message.channel.send('❌ حدث خطأ أثناء إرسال إعلان الاستبيان.');
      }
  }
  // --- أمر عرض نتائج الاستبيان المطور لحساب كافة الاختيارات ---
  if (message.content === '!نتائج-الاستبيان' || message.content === '!الاستبيان') {
      if (message.channel.id !== adminSurveyChannel) {
          return message.reply('❌ هذا الأمر مخصص للاستخدام في روم الإدارة الخاص بك فقط!');
      }

      if (!surveyColl) return message.reply('❌ قاعدة البيانات غير متصلة.');

      try {
          const allSurveys = await surveyColl.find({}).toArray();
          const total = allSurveys.length;
          
          if (total === 0) return message.reply('📭 لا توجد ردود في الاستبيان حتى الآن.');

          const suggestions = allSurveys.filter(s => s.suggestion && s.suggestion.trim() !== '').map(s => `• <@${s.userId}>: "${s.suggestion}"`).join('\n') || 'لا توجد اقتراحات كتابية.';
          const count = (qKey, val) => allSurveys.filter(s => s[qKey] === val).length;

          const embed = new EmbedBuilder()
              .setColor('#F1C40F')
              .setTitle('📊 تقارير ونتائج الاستبيان الشامل لـ 𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞')
              .setDescription(`📈 **إجمالي اللاعبين المشاركين:** \`${total} لاعب\`\n\n**تفاصيل تصويتات الأسئلة (الخيارات):**`)
              .addFields(
                  { name: '1️⃣ تنوع ألعاب البوت', value: `ممتازة: \`${count('survey_q1', 'q1_5')}\` | جيدة: \`${count('survey_q1', 'q1_4')}\` | مقبولة: \`${count('survey_q1', 'q1_3')}\` | ضعيفة: \`${count('survey_q1', 'q1_2')}\` | سيئة: \`${count('survey_q1', 'q1_1')}\``, inline: false },
                  { name: '2️⃣ ألعاب السرعة', value: `ممتعة جداً: \`${count('survey_q2', 'q2_yes')}\` | غير مهتم: \`${count('survey_q2', 'q2_no')}\` | تحتاج تعديل: \`${count('survey_q2', 'q2_edit')}\``, inline: false },
                  { name: '3️⃣ تعليق (Lag)', value: `دائماً: \`${count('survey_q3', 'q3_always')}\` | أحياناً: \`${count('survey_q3', 'q3_sometimes')}\` | أبداً: \`${count('survey_q3', 'q3_never')}\``, inline: false },
                  { name: '4️⃣ الرواتب والوظائف', value: `عادلة: \`${count('survey_q4', 'q4_fair')}\` | قليلة: \`${count('survey_q4', 'q4_low')}\` | عالية: \`${count('survey_q4', 'q4_high')}\``, inline: false },
                  { name: '5️⃣ العقارات', value: `حماسي: \`${count('survey_q5', 'q5_great')}\` | عادي: \`${count('survey_q5', 'q5_normal')}\` | معقد: \`${count('survey_q5', 'q5_hard')}\``, inline: false },
                  { name: '6️⃣ الحارس الشخصي', value: `مفيد: \`${count('survey_q6', 'q6_yes')}\` | لم أستخدمه: \`${count('survey_q6', 'q6_no')}\` | يحتاج تعديل: \`${count('survey_q6', 'q6_edit')}\``, inline: false },
                  { name: '7️⃣ الشركات', value: `رهيب: \`${count('survey_q7', 'q7_great')}\` | لم أشارك: \`${count('survey_q7', 'q7_no')}\` | لا يهمني: \`${count('survey_q7', 'q7_meh')}\``, inline: false },
                  { name: '8️⃣ القروض والديون', value: `جبار: \`${count('survey_q8', 'q8_yes')}\` | ماله داعي: \`${count('survey_q8', 'q8_no')}\` | لا أعرفه: \`${count('survey_q8', 'q8_idk')}\``, inline: false },
                  { name: '9️⃣ الأسهم العالمية', value: `ممتاز: \`${count('survey_q9', 'q9_great')}\` | معقد: \`${count('survey_q9', 'q9_hard')}\` | يحتاج تنويع: \`${count('survey_q9', 'q9_more')}\``, inline: false },
                  { name: '🔟 الطفرة والانهيار', value: `أستغلها: \`${count('survey_q10', 'q10_always')}\` | بالصدفة: \`${count('survey_q10', 'q10_sometimes')}\` | لا تهمني: \`${count('survey_q10', 'q10_no')}\``, inline: false },
                  { name: '💡 الاقتراحات الكتابية والأفكار:', value: suggestions.length > 1024 ? suggestions.substring(0, 1020) + '...' : suggestions, inline: false }
              )
              .setFooter({ text: '𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞 • لوحة إدارة الاستبيان' })
              .setTimestamp();

          return message.channel.send({ embeds: [embed] });
      } catch (err) {
          console.error(err);
          return message.reply('❌ حدث خطأ أثناء جلب نتائج الاستبيان.');
      }
  }

  if (allowedChannels.includes(message.channel.id) || allowedEconomyChannels.includes(message.channel.id)) {
      await trackUserMessage(guildId, userId, message.author.displayName, message.channel, message.member);
  }

  if (allowedStockChannels.includes(message.channel.id) || allowedEconomyChannels.includes(message.channel.id)) {
      if (message.content === '!اسهم' || message.content === '!الأسهم') {
          const unixTime = Math.floor(stockNextUpdate / 1000);

          const embed = new EmbedBuilder()
              .setColor('#9b59b6')
              .setTitle('📊 بورصة الأسهم العالمية والأصول الرقمية')
              .setDescription(`⏳ **يتجدد السوق وتتغير أسعار الأسهم:** <t:${unixTime}:R> (<t:${unixTime}:t>)\n\nاختر من الأزرار أدناه لإدارة استثماراتك ومحفظتك بكل سهولة:`);

          stockMarket.forEach(s => {
              embed.addFields({
                  name: `${s.emoji} ${s.name} (\`${s.id}\`) ${s.trend}`,
                  value: `💵 السعر الحالي: \`$${s.price.toLocaleString()}\``,
                  inline: true
              });
          });

          const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('stock_buy_menu').setLabel('🛒 شراء أسهم').setStyle(ButtonStyle.Success),
              new ButtonBuilder().setCustomId('stock_portfolio').setLabel('📈 محفظتي').setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId('stock_sell_menu').setLabel('🤝 بيع أسهم').setStyle(ButtonStyle.Danger)
          );

          embed.setFooter({ text: '𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞 • سوق الأسهم والمال' }).setTimestamp();
          return message.channel.send({ embeds: [embed], components: [row] });
      }
  }

  if (allowedEconomyChannels.includes(message.channel.id) || allowedChannels.includes(message.channel.id)) {
      if (message.content === '!اقتصاد') {
          const embed = new EmbedBuilder().setColor('#2ecc71').setTitle('🏦 النظام الاقتصادي والمزايا الفخمة').addFields(
              { name: '💵 الأساسيات', value: '`!راتب` | `!بنك`', inline: false },
              { name: '👤 الهوية', value: '`!هوية`', inline: false },
              { name: '👔 الوظائف', value: '`!وظائف`', inline: false },
              { name: '📈 السوق والعقارات', value: '`!سوق` | `!شراء` | `!بيع [رقم]` | `!املاكي`', inline: false },
              { name: '🏢 الهيئات والشركات', value: '`!تأسيس-شركة [الاسم] | [الشعار]`\n`!شركة` | `!مشاريع-الشركة` | `!ترتيب-الشركات` | `!دعوة-شركة [@شخص]` | `!شعار-شركة [رابط]`', inline: false },
              { name: '💼 القروض والبنوك', value: '`!قرض [المبلغ]` | `!سداد` | `!لوحة-المتعثرين`', inline: false },
              { name: '🛡️ الحماية وسرقة البنوك (Heist)', value: '`!شراء-حارس` | `!سرقة-بنك [@خويك1] [@خويك2] [@خويك3]`', inline: false },
              { name: '🎲 الجريمة والحظ', value: '`!سرقة [@شخص]` | `!حظ [المبلغ]` | `!صندوق` | `!مهامي`', inline: false }
          );
          return message.channel.send({ embeds: [embed] });
      }

      if (message.content.startsWith('!تأسيس-شركة')) {
          const args = message.content.replace('!تأسيس-شركة', '').trim().split('|');
          const corpName = args[0]?.trim();
          const corpTag = args[1]?.trim() || '👑';

          if (!corpName) return message.reply('❌ الاستخدام الصحيح: `!تأسيس-شركة [اسم الشركة] | [الشعار]`');

          let user = await getEconomyUser(guildId, userId);
          const creationCost = 25000;
          if (user.balance < creationCost) return message.reply(`💸 يتطلب تأسيس شركة \`$${creationCost.toLocaleString()}\`!`);

          let existingCorp = await guildsColl.findOne({ guildId, name: corpName });
          if (existingCorp) return message.reply('❌ اسم الشركة مستخدم مسبقاً!');

          user.balance -= creationCost;
          await saveEconomyUser(guildId, userId, user);

          const newCorp = { guildId, name: corpName, logo: corpTag, ownerId: userId, members: [userId], capital: creationCost, assets: [], createdAt: Date.now() };
          await guildsColl.insertOne(newCorp);

          return message.channel.send({ content: `🏢 **مبروك!** تم تأسيس شركة **${corpTag} ${corpName}** بنجاح! 🚀` });
      }

      if (message.content === '!شركة' || message.content === '!شركتي') {
          const corp = await guildsColl.findOne({ guildId, members: userId });
          if (!corp) return message.reply('❌ أنت لست عضواً في أي شركة حالياً!\n💡 يمكنك تأسيس شركة عبر: `!تأسيس-شركة [الاسم] | [الشعار]`');

          const embed = new EmbedBuilder()
              .setColor('#f1c40f')
              .setTitle(`🏢 إدارة شركة: ${corp.logo} ${corp.name}`)
              .setDescription('مرحباً بك في لوحة تحكم شركتك التجارية. استخدم الأزرار أدناه لإدارة الهيئة:')
              .addFields(
                  { name: '👑 المؤسس', value: `<@${corp.ownerId}>`, inline: true },
                  { name: '💰 رأس المال', value: `\`$${(corp.capital || 0).toLocaleString()}\``, inline: true },
                  { name: '👥 عدد الأعضاء', value: `\`${corp.members.length} أعضاء\``, inline: true },
                  { name: '🏭 الأصول والمشاريع', value: `\`${corp.assets ? corp.assets.length : 0} مشاريع مملوكة\``, inline: true }
              )
              .setFooter({ text: '𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞 • نظام الشركات والهوامير' })
              .setTimestamp();

          if (corp.image) embed.setThumbnail(corp.image);

          const row1 = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('corp_donate_btn').setLabel('💸 تبرع برأس المال').setStyle(ButtonStyle.Success),
              new ButtonBuilder().setCustomId('corp_members_btn').setLabel('👥 قائمة الأعضاء').setStyle(ButtonStyle.Primary),
              new ButtonBuilder().setCustomId('corp_assets_btn').setLabel('🏭 مشاريع الشركة').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId('corp_leave_btn').setLabel('🚪 مغادرة').setStyle(ButtonStyle.Danger)
          );

          const row2 = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('corp_invite_btn').setLabel('➕ دعوة عضو').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId('corp_logo_btn').setLabel('🖼️ تغيير الشعار').setStyle(ButtonStyle.Secondary),
              new ButtonBuilder().setCustomId('corp_rename_btn').setLabel('✏️ تعديل الاسم').setStyle(ButtonStyle.Secondary)
          );

          return message.channel.send({ embeds: [embed], components: [row1, row2] });
      }

      if (message.content === '!مشاريع-الشركة' || message.content === '!سوق-الشركة') {
          const corp = await guildsColl.findOne({ guildId, members: userId });
          if (!corp) return message.reply('❌ أنت لست في شركة حالياً!');

          const embed = new EmbedBuilder()
              .setColor('#3498DB')
              .setTitle(`🏭 سوق مشاريع وأصول شركة: ${corp.name}`)
              .setDescription(`💰 **رأس مال الشركة الحالي:** \`$${(corp.capital || 0).toLocaleString()}\`\n\nاختر من القائمة أدناه لشراء مشاريع تدر أرباحاً دورية على رأس مال شركتي:`);

          corpAssetsMarket.forEach(asset => {
              embed.addFields({
                  name: `${asset.emoji} ${asset.name}`,
                  value: `💵 التكلفة: \`$${asset.price.toLocaleString()}\` | 📈 الربح الساعي: \`$${asset.profit.toLocaleString()}\``,
                  inline: false
              });
          });

          const options = corpAssetsMarket.map(asset => ({
              label: `${asset.name} ($${asset.price.toLocaleString()})`,
              description: `الربح الساعي: $${asset.profit.toLocaleString()}`,
              value: `buy_asset_${asset.id}`,
              emoji: asset.emoji
          }));

          const row = new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                  .setCustomId('corp_buy_asset_select')
                  .setPlaceholder('🏭 اختر مشروعاً لشراءه برأس مال الشركة...')
                  .addOptions(options)
          );

          return message.channel.send({ embeds: [embed], components: [row] });
      }

      if (message.content.startsWith('!دعوة-شركة')) {
          const target = message.mentions.users.first();
          if (!target || target.bot) return message.reply('❌ الاستخدام الصحيح: `!دعوة-شركة [@الشخص]`');

          let corp = await guildsColl.findOne({ guildId, ownerId: userId });
          if (!corp) return message.reply('❌ عذراً، أمر الدعوة مخصص لمؤسس الشركة (المالك) فقط!');
          if (corp.members.includes(target.id)) return message.reply('⚠️ هذا الشخص موجود في شركتك بالفعل!');
          if (corp.members.length >= 5) return message.reply('❌ وصلت الشركة للحد الأقصى (5 أعضاء)!');

          await guildsColl.updateOne({ _id: corp._id }, { $push: { members: target.id } });
          return message.channel.send(`✅ **تمت إضافة العضو ${target} بنجاح إلى شركة ${corp.name}!** 🤝🏢`);
      }

      if (message.content.startsWith('!شعار-شركة')) {
          const args = message.content.replace('!شعار-شركة', '').trim();
          if (!args.startsWith('http://') && !args.startsWith('https://')) {
              return message.reply('❌ يرجى وضع رابط صحيح للصورة أو الـ GIF!\nمثال: `!شعار-شركة https://example.com/logo.gif`');
          }

          let corp = await guildsColl.findOne({ guildId, ownerId: userId });
          if (!corp) return message.reply('❌ تغيير شعار وصورة الشركة مخصص لمؤسس الشركة (المالك) فقط!');

          await guildsColl.updateOne({ _id: corp._id }, { $set: { image: args } });
          return message.reply(`✅ **تم تحديث شعار وصورة شركة ${corp.name} بنجاح!** 🖼️✨`);
      }

      if (message.content.startsWith('!تعديل-اسم-الشركة')) {
          const newName = message.content.replace('!تعديل-اسم-الشركة', '').trim();
          if (!newName) return message.reply('❌ الاستخدام الصحيح: `!تعديل-اسم-الشركة [الاسم الجديد]`');

          let corp = await guildsColl.findOne({ guildId, ownerId: userId });
          if (!corp) return message.reply('❌ تعديل اسم الشركة مخصص لمؤسس الشركة (المالك) فقط!');

          let existing = await guildsColl.findOne({ guildId, name: newName });
          if (existing) return message.reply('❌ اسم الشركة الجديد مستخدم مسبقاً!');

          await guildsColl.updateOne({ _id: corp._id }, { $set: { name: newName } });
          return message.reply(`✅ **تم تعديل اسم الشركة بنجاح إلى:** **${corp.logo} ${newName}** 🏢✨`);
      }

      if (message.content === '!ترتيب-الشركات') {
          const corps = await guildsColl.find({ guildId }).sort({ capital: -1 }).limit(10).toArray();
          if (!corps || corps.length === 0) return message.reply('📭 لا توجد شركات مسجلة بعد.');

          const embed = new EmbedBuilder().setColor('#3498DB').setTitle('🏆 لوحة صدارة الهيئات والشركات');
          corps.forEach((c, index) => {
              embed.addFields({ name: `${index + 1}. ${c.logo} **${c.name}**`, value: `👑 المالك: <@${c.ownerId}>\n💰 رأس المال: \`$${(c.capital || 0).toLocaleString()}\``, inline: false });
          });
          return message.channel.send({ embeds: [embed] });
      }

      if (message.content.startsWith('!قرض')) {
          const args = message.content.split(' ');
          const loanAmt = parseInt(args[1]);
          if (isNaN(loanAmt) || loanAmt <= 0) return message.reply('❌ الاستخدام الصحيح: `!قرض [المبلغ]`');

          let user = await getEconomyUser(guildId, userId);
          if (user.loan > 0) return message.reply(`❌ لديك قرض غير مسدد بقيمة \`$${user.loan.toLocaleString()}\`!`);

          const totalDebt = Math.floor(loanAmt * 1.15);
          user.balance += loanAmt;
          user.loan = totalDebt;
          user.loanDueDate = Date.now() + (24 * 60 * 60 * 1000);
          await saveEconomyUser(guildId, userId, user);

          return message.reply(`✅ تم إيداع **$${loanAmt.toLocaleString()}** بحسابك.\n📌 إجمالي واجب السداد (مع فائدة 15%): \`$${totalDebt.toLocaleString()}\``);
      }

      if (message.content === '!سداد') {
          let user = await getEconomyUser(guildId, userId);
          if (!user.loan || user.loan <= 0) return message.reply('✅ ليس عليك أي ديون مستحقة!');
          if (user.balance < user.loan) return message.reply(`💸 رصيدك لا يكفي لسداد القرض ($${user.loan.toLocaleString()})!`);

          user.balance -= user.loan;
          user.loan = 0;
          user.loanDueDate = 0;
          await saveEconomyUser(guildId, userId, user);
          return message.reply('🎉 تم تسديد القرض البنكي بالكامل بنجاح!');
      }

      if (message.content === '!لوحة-المتعثرين') {
          const debtors = await economyColl.find({ guildId, loan: { $gt: 0 } }).sort({ loan: -1 }).limit(10).toArray();
          if (!debtors || debtors.length === 0) return message.reply('🏆 لا توجد قروض متعثرة في السيرفر.');

          const embed = new EmbedBuilder().setColor('#e74c3c').setTitle('🚨 لوحة المتعثرين والمديونين');
          debtors.forEach((d, idx) => {
              embed.addFields({ name: `${idx + 1}. <@${d.userId}>`, value: `📉 الدين: \`$${d.loan.toLocaleString()}\``, inline: false });
          });
          return message.channel.send({ embeds: [embed] });
      }

      if (message.content === '!شراء-حارس' || message.content === '!حماية') {
          let user = await getEconomyUser(guildId, userId);
          const cost = 15000;
          if (user.guard && user.guardShields > 0) {
              return message.reply(`🛡️ لديك حارس شخصي مفعل حالياً ومتبقي له **${user.guardShields} صدات** دفاعية!`);
          }
          if (user.balance < cost) return message.reply(`💸 التكلفة \`$${cost.toLocaleString()}\` ورصيدك لا يكفي!`);

          user.balance -= cost;
          user.guard = true;
          user.guardShields = 3; 
          await saveEconomyUser(guildId, userId, user);
          return message.reply('🛡️ **تم تعيين حارس شخصي بنجاح!**\n⚡ الحارس جاهز لصد أول **3 محاولات سرقة** تتعرض لها.');
      }

      if (message.content.startsWith('!سرقة-بنك')) {
          const mentions = message.mentions.users.filter(u => !u.bot && u.id !== userId);
          if (mentions.size < 3) return message.reply('❌ سرقة البنك تتطلب قائد و **3 من خويك**: `!سرقة-بنك [@خويك1] [@خويك2] [@خويك3]`');

          let leader = await getEconomyUser(guildId, userId);
          const now = Date.now();
          if (leader.lastHeist && (now - leader.lastHeist < 30 * 60 * 1000)) {
              return message.reply('⏳ البنك محاط بالشرطة حالياً، انتظر قليلاً قبل محاولة الهوست القادم.');
          }
          leader.lastHeist = now;
          await saveEconomyUser(guildId, userId, leader);

          const teamMembers = [message.author, ...mentions.values()];
          const teamMentions = teamMembers.map(m => `<@${m.id}>`).join('، ');

          const embed = new EmbedBuilder().setColor('#e74c3c').setTitle('🚨 تخطيط وتجهيز لسرقة البنك المركزي (Heist)!').setDescription(`عصابة ${teamMentions} تقتحم البنك المركزي الآن!\n\n⚡ اضغط الزر السريع أدناه للنجاح خلال 15 ثانية!`);
          const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('heist_hack').setLabel('💻 اختراق الخزنة').setStyle(ButtonStyle.Success));

          const msg = await message.channel.send({ embeds: [embed], components: [row] });
          const collector = msg.createMessageComponentCollector({ time: 15000, max: 1 });

          collector.on('collect', async i => {
              await i.deferUpdate().catch(()=>{});
              const success = Math.random() < 0.60;
              if (success) {
                  const totalLoot = Math.floor(Math.random() * 150000) + 80000;
                  const share = Math.floor(totalLoot / teamMembers.length);
                  for (const member of teamMembers) {
                      let mEco = await getEconomyUser(guildId, member.id);
                      mEco.balance += share;
                      await saveEconomyUser(guildId, member.id, mEco);
                  }
                  await msg.edit({ content: `💰 **نجحت العصابة (${teamMentions}) في سرقة البنك المركزي!** حصيلة كل فرد: \`$${share.toLocaleString()}\` 🚀`, components: [] }).catch(()=>{});
              } else {
                  for (const member of teamMembers) {
                      let mEco = await getEconomyUser(guildId, member.id);
                      mEco.balance = Math.max(0, mEco.balance - 15000);
                      await saveEconomyUser(guildId, member.id, mEco);
                  }
                  await msg.edit({ content: `🚨 **فشلت العملية وتم القبض على العصابة (${teamMentions})!** غرامة 15,000$ لكل فرد 🚔💀`, components: [] }).catch(()=>{});
              }
          });
      }

      if (message.content === '!بنك' || message.content === '!ابنك') {
          const user = await getEconomyUser(guildId, userId);
          return message.reply(`💳 رصيدك: **$${user.balance.toLocaleString()}** | القرض: **$${(user.loan || 0).toLocaleString()}** | الحارس: **${user.guard && user.guardShields > 0 ? `🛡️ مفعل (${user.guardShields} صدات)` : '❌'}** | وظيفتك: **${user.job}**`);
      }

      if (message.content === '!راتب' || message.content === 'راتب') {
          if (processingUsers.has(userId)) return;
          processingUsers.add(userId);

          try {
              let user = await getEconomyUser(guildId, userId);
              const now = Date.now();
              const cooldown = 5 * 60 * 1000;

              if (user.lastWork && (now - user.lastWork < cooldown)) {
                  const remainingMs = cooldown - (now - user.lastWork);
                  const m = Math.floor(remainingMs / 60000);
                  const s = Math.floor((remainingMs % 60000) / 1000);
                  processingUsers.delete(userId);
                  return message.reply(`⏳ يابن الحلال! باقي **${m} دقيقة و ${s} ثانية** على راتبك القادم.`);
              }

              let baseSalary = 500;
              for (let key in jobsList) {
                  if (user.job === jobsList[key].name) {
                      baseSalary = jobsList[key].salary;
                      break;
                  }
              }

              let totalProfit = 0;
              if (user.properties && user.properties.length > 0) {
                  user.properties.forEach(pid => {
                      const item = marketItems.find(i => i.id === pid);
                      if (item) totalProfit += item.profit;
                  });
              }

              const totalReceived = baseSalary + totalProfit;
              user.balance += totalReceived;
              user.lastWork = now;
              await saveEconomyUser(guildId, userId, user);
              processingUsers.delete(userId);

              return message.reply(`💵 تم إيداع راتب وظيفتك (${user.job}) بقيمة **$${baseSalary.toLocaleString()}** + أرباح عقارك وأملاكك بقيمة **$${totalProfit.toLocaleString()}**.\n💰 **إجمالي المبلغ المودع:** \`$${totalReceived.toLocaleString()}\` 🚀`);
          } catch (err) {
              processingUsers.delete(userId);
              console.error(err);
          }
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
              .setTitle(`👤 الهوية الشخصية: ${targetName}`)
              .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
              .addFields(
                  { name: '💳 الرصيد المالي', value: `\`$${ecoData.balance.toLocaleString()}\``, inline: true },
                  { name: '👔 الوظيفة الحالية', value: `\`${ecoData.job}\``, inline: true },
                  { name: '⭐ رصيد النقاط', value: `\`${~~ptsData.points} نقطة\``, inline: true },
                  { name: '🚀 المستوى (Level)', value: `\`Level ${ptsData.level}\` (XP: ${ptsData.xp} / ${xpNeeded})`, inline: false },
                  { name: '🏠 عدد العقارات والأملاك', value: `\`${ecoData.properties.length} عقار\``, inline: true },
                  { name: '🔥 عدد الرسائل والتفاعل', value: `\`${ptsData.messagesCount} رسالة\``, inline: true }
              )
              .setFooter({ text: '𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞 • نظام الهوية والإنجازات' })
              .setTimestamp();

          return message.channel.send({ embeds: [profileEmbed] });
      }

      if (message.content === '!وظائف') {
          const pUser = await getPointsUser(guildId, userId, message.author.displayName);
          const user = await getEconomyUser(guildId, userId);

          const options = Object.keys(jobsList).map(key => {
              const j = jobsList[key];
              const isUnlocked = pUser.level >= j.level;
              return {
                  label: `${j.name} (راتب: $${j.salary.toLocaleString()})`,
                  description: isUnlocked ? `✨ متاحة! تتطلب Level ${j.level}` : `🔒 مغلقة! تتطلب Level ${j.level}`,
                  value: `job_${key}`
              };
          });

          const row = new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                  .setCustomId('job_select_menu')
                  .setPlaceholder('👔 اختر وظيفتك الجديدة من القائمة...')
                  .addOptions(options)
          );

          const embed = new EmbedBuilder()
              .setColor('#3498DB')
              .setTitle('👔 سلّم الوظائف واختيار المهنة')
              .setDescription(`مستواك الحالي: \`Level ${pUser.level}\`\nوظيفتك الحالية: \`${user.job}\`\n\nاختر وظيفتك المطلوبة من القائمة أدناه للترقية الفورية بضغطة زر:`);

          return message.channel.send({ embeds: [embed], components: [row] });
      }

      if (message.content === '!سوق') {
          const unixTime = Math.floor(marketNextUpdate / 1000);
          const embed = new EmbedBuilder()
              .setColor('#0099ff')
              .setTitle('📈 بورصة العقارات والأعمال')
              .setDescription(`⏳ **يتجدد السوق وتتغير الأسعار:** <t:${unixTime}:R> (<t:${unixTime}:t>)`);

          const sortedMarket = [...marketItems].sort((a, b) => a.price - b.price);

          sortedMarket.forEach(i => embed.addFields({ 
              name: `${i.emoji} ${i.name} ${i.trend}`, 
              value: `💰 السعر: \`$${i.price.toLocaleString()}\` | 💸 ربح: \`$${i.profit.toLocaleString()}\``, 
              inline: true 
          }));

          const actionRow = new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('open_buy_menu').setLabel('🛒 شراء عقار').setStyle(ButtonStyle.Success),
              new ButtonBuilder().setCustomId('open_sell_menu').setLabel('🤝 بيع عقار').setStyle(ButtonStyle.Danger)
          );

          return message.channel.send({ embeds: [embed], components: [actionRow] });
      }

      if (message.content === '!شراء') {
          const user = await getEconomyUser(guildId, userId);
          const sortedMarket = [...marketItems].sort((a, b) => a.price - b.price);

          const options = sortedMarket.map((item) => ({
              label: `${item.name} ($${item.price.toLocaleString()})`,
              description: `الربح: $${item.profit.toLocaleString()}`,
              value: `buy_${item.id}`,
              emoji: item.emoji || '💼'
          }));

          const row = new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                  .setCustomId('market_buy_select')
                  .setPlaceholder('🛒 اختر العقار أو المحل الذي تريد شراءه...')
                  .addOptions(options)
          );

          return message.channel.send({
              content: `🛍️ **متجر وسوق العقارات والأعمال**\nرصيدك الحالي: \`$${user.balance.toLocaleString()}\``,
              components: [row]
          });
      }

      if (message.content === '!املاكي') {
          const user = await getEconomyUser(guildId, userId);
          if (!user.properties || user.properties.length === 0) return message.reply('مفلس! ما عندك عقارات مسجلة.');

          const propertyCounts = {};
          user.properties.forEach(pid => { propertyCounts[pid] = (propertyCounts[pid] || 0) + 1; });

          let sortedProperties = Object.keys(propertyCounts).map(pid => {
              const item = marketItems.find(i => i.id === parseInt(pid));
              const count = propertyCounts[pid];
              return { ...item, count, totalPrice: item.price * count, totalProfit: item.profit * count };
          }).filter(item => item !== undefined);

          sortedProperties.sort((a, b) => b.totalPrice - a.totalPrice);
          let grandTotalValue = sortedProperties.reduce((acc, curr) => acc + curr.totalPrice, 0);
          let grandTotalProfit = sortedProperties.reduce((acc, curr) => acc + curr.totalProfit, 0);
          let totalCountProperties = user.properties.length;

          const itemsPerPage = 5;
          const totalPages = Math.ceil(sortedProperties.length / itemsPerPage);
          let page = 1;

          const generateEmbed = (pageNum) => {
              const start = (pageNum - 1) * itemsPerPage;
              const pageItems = sortedProperties.slice(start, start + itemsPerPage);

              const embed = new EmbedBuilder()
                  .setColor('#00FF00')
                  .setTitle(`🏠 محفظة وعقارات: ${message.author.displayName}`)
                  .setDescription(`📊 **ملخص المحفظة الشامل:**\n• إجمالي العقارات: \`${totalCountProperties} عقار\`\n• المبلغ الكامل للقيمة: \`$${grandTotalValue.toLocaleString()}\`\n• إجمالي الربح بالراتب: \`$${grandTotalProfit.toLocaleString()}\`\n\n---`)
                  .setFooter({ text: `صفحة ${pageNum} من ${totalPages} • 𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞` });

              pageItems.forEach((item, idx) => {
                  const globalIdx = start + idx + 1;
                  embed.addFields({
                      name: `${globalIdx}. ${item.emoji} ${item.name} ${item.count > 1 ? `(العدد: x${item.count})` : ''}`,
                      value: `💰 القيمة: \`$${item.totalPrice.toLocaleString()}\` | 💸 الربح: \`$${item.totalProfit.toLocaleString()}\``,
                      inline: false
                  });
              });

              return embed;
          };

          const getButtons = (pageNum) => {
              return new ActionRowBuilder().addComponents(
                  new ButtonBuilder().setCustomId('prop_prev').setLabel('⬅️ السابق').setStyle(ButtonStyle.Primary).setDisabled(pageNum === 1),
                  new ButtonBuilder().setCustomId('prop_next').setLabel('التالي ➡️').setStyle(ButtonStyle.Primary).setDisabled(pageNum === totalPages)
              );
          };

          const msg = await message.channel.send({ embeds: [generateEmbed(page)], components: totalPages > 1 ? [getButtons(page)] : [] });
          if (totalPages <= 1) return;

          const collector = msg.createMessageComponentCollector({ time: 60000 });
          collector.on('collect', async i => {
              if (i.user.id !== userId) return i.reply({ content: '❌ هذه المحفظة ليست لك!', ephemeral: true });
              await i.deferUpdate().catch(()=>{});
              if (i.customId === 'prop_prev' && page > 1) page--;
              else if (i.customId === 'prop_next' && page < totalPages) page++;
              await msg.edit({ embeds: [generateEmbed(page)], components: [getButtons(page)] });
          });
          collector.on('end', () => { msg.edit({ components: [] }).catch(()=>{}); });
          return;
      }

      if (message.content.startsWith('!بيع ')) {
          const idx = parseInt(message.content.split(' ')[1]) - 1;
          let user = await getEconomyUser(guildId, userId);
          if (isNaN(idx) || idx < 0 || idx >= user.properties.length) return message.reply('❌ رقم العقار غير صحيح!');
          const item = marketItems.find(i => i.id === user.properties[idx]);
          const sellP = Math.floor(item.price * 0.90);
          user.properties.splice(idx, 1); user.balance += sellP;
          await saveEconomyUser(guildId, userId, user);
          return message.reply(`🤝 بعت **${item.name}** بـ **$${sellP.toLocaleString()}** (بعد خصم 10% رسوم).`);
      }

      if (message.content.startsWith('!سرقة')) {
          const target = message.mentions.users.first();
          if (!target) return message.reply('❌ الاستخدام الصحيح: `!سرقة [@الشخص]`');
          if (target.bot || target.id === userId) return message.reply('😅 ما تقدر تسرق بوت أو تسرق نفسك!');
          let user = await getEconomyUser(guildId, userId);
          const now = Date.now();
          if (user.lastCrime && (now - user.lastCrime < 10 * 60 * 1000)) {
              return message.reply('🚓 الشرطة تراقبك! انتظر قليلاً قبل محاولة السرقة التالية.');
          }
          let targetUser = await getEconomyUser(guildId, target.id);
          if (targetUser.balance < 500) return message.reply('💸 الضحية مفلس!');
          user.lastCrime = now;

          let hasActiveGuard = targetUser.guard && targetUser.guardShields > 0;
          let successChance = hasActiveGuard ? 0.15 : 0.45;

          if (Math.random() < successChance) {
              const stolen = Math.floor(targetUser.balance * (hasActiveGuard ? 0.1 : 0.3)) + 100;
              targetUser.balance -= stolen; user.balance += stolen;
              await saveEconomyUser(guildId, target.id, targetUser);
              await saveEconomyUser(guildId, userId, user);
              return message.channel.send(`🦹‍♂️ **عملية ناجحة!** سرق ${message.author} مبلغ **$${stolen.toLocaleString()}** من ${target}! 💰🔥`);
          } else {
              let guardMsg = '';
              if (hasActiveGuard) {
                  targetUser.guardShields -= 1;
                  if (targetUser.guardShields <= 0) {
                      targetUser.guard = false;
                      guardMsg = '\n🛡️💥 **انتهت طاقة الحارس وهرب بعد تصديه للهجوم!** (يجب شراء حارس جديد)';
                  } else {
                      guardMsg = `\n🛡️ **تصدى الحارس للسرقة!** متبقي له (${targetUser.guardShields}) صدات دفاعية.`;
                  }
                  await saveEconomyUser(guildId, target.id, targetUser);
              }

              const fine = hasActiveGuard ? 800 : 300;
              user.balance = Math.max(0, user.balance - fine);
              await saveEconomyUser(guildId, userId, user);
              return message.channel.send(`🚨 **فشلت السرقة!** غرمته الشرطة **$${fine}**! 🚔💀${guardMsg}`);
          }
      }

      if (message.content.startsWith('!حظ')) {
          const amt = parseInt(message.content.split(' ')[1]);
          if (isNaN(amt) || amt <= 50) return message.reply('❌ أدخل مبلغ مراهنة صحيح (أقل مبلغ 50): `!حظ [المبلغ]`');
          let user = await getEconomyUser(guildId, userId);
          const now = Date.now();
          if (user.lastGambling && (now - user.lastGambling < 2.5 * 60 * 1000)) return message.reply('⏳ اهدأ شوي، باقي وقت.');

          if (user.balance < amt) return message.reply('💸 رصيدك ما يكفي!');
          user.lastGambling = now;
          
          const roll = Math.random();
          if (roll < 0.40) { user.balance -= amt; message.reply(`😢 خسرت رهنتك وراحت عليك **$${amt.toLocaleString()}**!`); }
          else if (roll < 0.85) { user.balance += amt; message.reply(`🎰 **كفووو!** فزت وضاعفت فلوسك وكسبت **$${amt.toLocaleString()}**! 🎉`); }
          else { user.balance += amt * 3; message.channel.send(`👑 **ضربت الحظ الكبرى!** كسبت أضعاف مضاعفة بقيمة **$${(amt*3).toLocaleString()}** يا ${message.author}! 🔥`); }
          await saveEconomyUser(guildId, userId, user);
      }

      if (message.content === '!صندوق') {
          let user = await getEconomyUser(guildId, userId);
          if (user.balance < 3000) return message.reply('📦 سعر الصندوق السري **$3,000** ورصيدك لا يكفي!');
          user.balance -= 3000;
          const prizes = [1500, 5000, 12000, 0];
          const won = prizes[Math.floor(Math.random() * prizes.length)];
          if (won > 0) user.balance += won;
          await saveEconomyUser(guildId, userId, user);
          return message.reply(`📦 فتحت الصندوق السري وطلع لك: **$${won.toLocaleString()}**!`);
      }

      if (message.content === '!مهامي') {
          let user = await getEconomyUser(guildId, userId);
          const now = Date.now();
          if (user.lastQuest && (now - user.lastQuest < 24 * 60 * 60 * 1000)) return message.reply('⏳ أتممت مهام اليوم بالفعل!');
          user.lastQuest = now; user.balance += 5000;
          await saveEconomyUser(guildId, userId, user);
          return message.reply(`🎯 أتممت مهام اليوم بنجاح وحصلت على مكافأة **$5,000**!`);
      }

      if (message.content.startsWith('!تحويل')) {
          const args = message.content.split(' ');
          const target = message.mentions.users.first();
          const amt = parseInt(args[2]);
          if (!target || isNaN(amt) || amt <= 0) return message.reply('❌ الاستخدام الصحيح: `!تحويل [@الشخص] [المبلغ]`');
          if (target.id === userId) return message.reply('😅 ما تقدر تحول لنفسك!');
          let s = await getEconomyUser(guildId, userId);
          if (s.balance < amt) return message.reply('💸 رصيدك ما يكفي!');
          s.balance -= amt; await saveEconomyUser(guildId, userId, s);
          let r = await getEconomyUser(guildId, target.id);
          r.balance += amt; await saveEconomyUser(guildId, target.id, r);
          return message.channel.send(`✅ تم تحويل **$${amt.toLocaleString()}** بنجاح إلى ${target}!`);
      }
  }

  if (allowedChannels.includes(message.channel.id) || allowedEconomyChannels.includes(message.channel.id)) {
      if (message.content === '!فعالية' || message.content === '!لعبة' || message.content === '!العب') {
          if (activeGames.has(message.channel.id)) return message.reply('⏳ فيه لعبة شغالة في هذه الروم!');
          const r = Math.floor(Math.random() * 16);
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
          else if (r === 10) startPenaltyGame(message.channel, guildId);
          else if (r === 11) startMinesGame(message.channel, guildId, userId);
          else if (r === 12) startRaceGame(message.channel, guildId, userId);
          else if (r === 13) startVaultGame(message.channel, guildId, userId);
          else startBoxesGame(message.channel, guildId, userId);
          return;
      }

      if (message.content === '!العاب' || message.content === '!ألعاب') return sendGamesMenu(message.channel);

      if (message.content === '!ت') {
          if (!pointsColl || !economyColl) return message.reply('🏆 قاعدة البيانات غير متصلة.');

          const topPoints = await pointsColl.find({ guildId }).sort({ points: -1 }).limit(5).toArray();
          const topRich = await economyColl.find({ guildId }).sort({ balance: -1 }).limit(5).toArray();
          const topSpeed = await pointsColl.find({ guildId, bestTime: { $ne: 999999 } }).sort({ bestTime: 1 }).limit(5).toArray();
          const topLevel = await pointsColl.find({ guildId }).sort({ level: -1, xp: -1 }).limit(5).toArray();

          let page = 1;
          const totalPages = 4;

          const generateEmbed = (pageNum) => {
              const embed = new EmbedBuilder().setColor('#FFD700').setFooter({ text: `صفحة ${pageNum} من ${totalPages} • 𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞` });
              if (pageNum === 1) embed.setTitle('👑 لوحة صدارة النقاط').setDescription(topPoints.length ? topPoints.map((d, i) => `${i+1}. <@${d.userId}>: \`${d.points} نقطة\``).join('\n') : 'لا توجد بيانات.');
              else if (pageNum === 2) embed.setTitle('💎 لوحة صدارة الأثرياء').setDescription(topRich.length ? topRich.map((d, i) => `${i+1}. <@${d.userId}>: \`$${d.balance.toLocaleString()}\``).join('\n') : 'لا توجد بيانات.');
              else if (pageNum === 3) embed.setTitle('⚡ لوحة أسرع اللاعبين').setDescription(topSpeed.length ? topSpeed.map((d, i) => `${i+1}. <@${d.userId}>: \`${d.bestTime} ثانية\``).join('\n') : 'لا توجد سجلات.');
              else if (pageNum === 4) embed.setTitle('🚀 لوحة مستويات التلفيل').setDescription(topLevel.length ? topLevel.map((d, i) => `${i+1}. <@${d.userId}>: \`Level ${d.level}\``).join('\n') : 'لا توجد بيانات.');
              return embed;
          };

          const getButtons = (pageNum) => {
              return new ActionRowBuilder().addComponents(
                  new ButtonBuilder().setCustomId('lb_prev').setLabel('⬅️ السابق').setStyle(ButtonStyle.Primary).setDisabled(pageNum === 1),
                  new ButtonBuilder().setCustomId('lb_next').setLabel('التالي ➡️').setStyle(ButtonStyle.Primary).setDisabled(pageNum === totalPages)
              );
          };

          const msg = await message.channel.send({ embeds: [generateEmbed(page)], components: [getButtons(page)] });
          const collector = msg.createMessageComponentCollector({ time: 60000 });

          collector.on('collect', async i => {
              if (i.user.id !== userId) return i.reply({ content: '❌ هذه اللوحة ليست لك!', ephemeral: true });
              await i.deferUpdate().catch(()=>{});
              if (i.customId === 'lb_prev' && page > 1) page--;
              else if (i.customId === 'lb_next' && page < totalPages) page++;
              await msg.edit({ embeds: [generateEmbed(page)], components: [getButtons(page)] });
          });

          collector.on('end', () => { msg.edit({ components: [] }).catch(()=>{}); });
          return;
      }

      const text = message.content.toLowerCase();
      if (text === '!قنبلة') startBombGame(message.channel, guildId);
      if (text === '!زر') startButtonGame(message.channel, guildId);
      if (text === '!فكك') startScrambleGame(message.channel, guildId);
      if (text === '!رياضيات') startMathGame(message.channel, guildId);
      if (text === '!عواصم') startCapitalGame(message.channel, guildId);
      if (text === '!عكس') startReverseGame(message.channel, guildId);
      if (text === '!ذكاء') startTriviaGame(message.channel, guildId);
      if (text === '!تخمين') startGuessGame(message.channel, guildId);
      if (text === '!إيموجي') startEmojiGame(message.channel, guildId);
      if (text === '!معنى') startMeaningGame(message.channel, guildId);
      if (text === '!بلنتي') startPenaltyGame(message.channel, guildId);
      if (text === '!ألغام') startMinesGame(message.channel, guildId, userId);
      if (text === '!سباق') startRaceGame(message.channel, guildId, userId);
      if (text === '!خزنة') startVaultGame(message.channel, guildId, userId);
      if (text === '!صناديق') startBoxesGame(message.channel, guildId, userId);

      if (message.content === '!روليت') {
          if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!');
          activeGames.set(message.channel.id, 'roulette');
          setTimeout(() => {
              activeGames.delete(message.channel.id);
              if (Math.floor(Math.random() * 6) + 1 === 1) message.channel.send(`💥 **بووووم!** ${message.author} خسر 💀.`);
              else { message.channel.send(`😅 المسدس فاضي! كسبت **10 نقاط** يا ${message.author}.`); addPoints(guildId, userId, message.author.displayName, message.channel); }
          }, 3000);
      }

      if (message.content === '!ايقاف' || message.content === '!إيقاف') {
          activeGames.delete(message.channel.id);
          return message.channel.send('🛑 **تم إيقاف اللعبة الجارية بنجاح!**');
      }
  }
});

client.on('interactionCreate', async interaction => {
    const guildId = interaction.guild?.id || 'DM_CHANNEL';
    const userId = interaction.user.id;

    if (interaction.isButton()) {
        if (interaction.customId === 'open_buy_menu') {
            const user = await getEconomyUser(guildId, userId);
            const sortedMarket = [...marketItems].sort((a, b) => a.price - b.price);
            const options = sortedMarket.map((item) => ({ label: `${item.name} ($${item.price.toLocaleString()})`, value: `buy_${item.id}`, emoji: item.emoji || '💼' }));
            const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('market_buy_select').setPlaceholder('🛒 اختر عقاراً للشراء...').addOptions(options));
            return interaction.reply({ content: `🛍️ رصيدك: \`$${user.balance.toLocaleString()}\``, components: [row], ephemeral: true });
        }

        if (interaction.customId === 'open_sell_menu') {
            let user = await getEconomyUser(guildId, userId);
            if (!user.properties || user.properties.length === 0) {
                return interaction.reply({ content: '❌ ليس لديك أي عقارات أو أملاك لبيعها!', ephemeral: true });
            }

            const options = user.properties.map((propId, idx) => {
                const item = marketItems.find(i => i.id === propId);
                const sellP = Math.floor(item.price * 0.90);
                return {
                    label: `${item.name} (سعر البيع: $${sellP.toLocaleString()})`,
                    description: `العقار رقم ${idx + 1} في محفظتك`,
                    value: `sell_prop_${idx}`,
                    emoji: item.emoji || '🏠'
                };
            });

            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('market_sell_select')
                    .setPlaceholder('🤝 اختر العقار الذي تريد بيعه...')
                    .addOptions(options)
            );

            return interaction.reply({
                content: `🤝 **قائمة بيع العقارات والأملاك** (خصم 10% رسوم سوق):\nاختر العقار المراد بيعه من القائمة أدناه:`,
                components: [row],
                ephemeral: true
            });
        }

        if (interaction.customId === 'stock_buy_menu') {
            const modal = new ModalBuilder().setCustomId('stock_buy_modal').setTitle('🛒 شراء أسهم عالمية');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('stock_symbol').setLabel('رمز السهم (aapl, tsla, btc...)').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('stock_amount').setLabel('الكمية').setStyle(TextInputStyle.Short).setRequired(true))
            );
            return interaction.showModal(modal);
        }

        if (interaction.customId === 'stock_portfolio') {
            let user = await getEconomyUser(guildId, userId);
            if (!user.stocks || Object.keys(user.stocks).length === 0) return interaction.reply({ content: '📭 محفظتك فارغة!', ephemeral: true });

            let text = '📈 **أسهمك المملوكة:**\n';
            let totalVal = 0;
            for (const [sId, qty] of Object.entries(user.stocks)) {
                const stock = stockMarket.find(s => s.id === sId);
                if (stock && qty > 0) {
                    const val = stock.price * qty;
                    totalVal += val;
                    text += `• ${stock.emoji} ${stock.name}: \`x${qty}\` (القيمة: $\`${val.toLocaleString()}\`)\n`;
                }
            }
            text += `\n💎 **إجمالي المحفظة:** $\`${totalVal.toLocaleString()}\``;
            return interaction.reply({ content: text, ephemeral: true });
        }

        if (interaction.customId === 'stock_sell_menu') {
            const modal = new ModalBuilder().setCustomId('stock_sell_modal').setTitle('🤝 بيع أسهم عالمية');
            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('stock_symbol').setLabel('رمز السهم المراد بيعه').setStyle(TextInputStyle.Short).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('stock_amount').setLabel('الكمية للبيع').setStyle(TextInputStyle.Short).setRequired(true))
            );
            return interaction.showModal(modal);
        }

        if (interaction.customId === 'corp_donate_btn') {
            const modal = new ModalBuilder().setCustomId('corp_donate_modal').setTitle('💸 تبرع لدعم رأس مال الشركة');
            const amountInput = new TextInputBuilder().setCustomId('donate_amount').setLabel('أدخل مبلغ التبرع (بالدولار)').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
            return interaction.showModal(modal);
        }

        if (interaction.customId === 'corp_members_btn') {
            const corp = await guildsColl.findOne({ guildId, members: userId });
            if (!corp) return interaction.reply({ content: '❌ أنت لست في شركة!', ephemeral: true });

            const memberList = corp.members.map(id => `<@${id}>`).join('\n');
            const embed = new EmbedBuilder().setColor('#3498DB').setTitle(`👥 أعضاء شركة: ${corp.name}`).setDescription(memberList);
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (interaction.customId === 'corp_assets_btn') {
            const corp = await guildsColl.findOne({ guildId, members: userId });
            if (!corp) return interaction.reply({ content: '❌ أنت لست في شركة!', ephemeral: true });

            let assetList = '📭 لا توجد مشاريع مملوكة للشركة حتى الآن.';
            if (corp.assets && corp.assets.length > 0) {
                assetList = corp.assets.map(aId => {
                    const item = corpAssetsMarket.find(a => a.id === aId);
                    return item ? `• ${item.emoji} **${item.name}** (ربح ساعي: \`$${item.profit.toLocaleString()}\`)` : '';
                }).filter(Boolean).join('\n');
            }

            const embed = new EmbedBuilder()
                .setColor('#2ECC71')
                .setTitle(`🏭 أصول ومشاريع شركة: ${corp.name}`)
                .setDescription(`📊 **الأصول المملوكة حالياً:**\n${assetList}\n\n💡 أرباح هذه المشاريع تضاف تلقائياً لرأس مال الشركة كل ساعة!`);

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (interaction.customId === 'corp_leave_btn') {
            let corp = await guildsColl.findOne({ guildId, members: userId });
            if (!corp) return interaction.reply({ content: '❌ أنت لست في شركة!', ephemeral: true });
            if (corp.ownerId === userId) return interaction.reply({ content: '⚠️ أنت مؤسس الشركة ولا يمكنك مغادرتها!', ephemeral: true });

            await guildsColl.updateOne({ _id: corp._id }, { $pull: { members: userId } });
            return interaction.update({ content: `✅ لقد غادرت شركة **${corp.name}** بنجاح.`, embeds: [], components: [] });
        }

        if (interaction.customId === 'corp_invite_btn') {
            let corp = await guildsColl.findOne({ guildId, ownerId: userId });
            if (!corp) return interaction.reply({ content: '❌ مخصص لمؤسس الشركة فقط!', ephemeral: true });

            const modal = new ModalBuilder().setCustomId('corp_invite_modal').setTitle('➕ دعوة عضو جديد للشركة');
            const memberInput = new TextInputBuilder().setCustomId('invite_user_id').setLabel('أدخل آيدي (ID) العضو المراد دعوته').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(memberInput));
            return interaction.showModal(modal);
        }

        if (interaction.customId === 'corp_logo_btn') {
            let corp = await guildsColl.findOne({ guildId, ownerId: userId });
            if (!corp) return interaction.reply({ content: '❌ مخصص لمؤسس الشركة فقط!', ephemeral: true });

            const modal = new ModalBuilder().setCustomId('corp_logo_modal').setTitle('🖼️ تغيير شعار/صورة الشركة');
            const logoInput = new TextInputBuilder().setCustomId('new_logo_url').setLabel('أدخل رابط الصورة أو الـ GIF المباشر').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(logoInput));
            return interaction.showModal(modal);
        }

        if (interaction.customId === 'corp_rename_btn') {
            let corp = await guildsColl.findOne({ guildId, ownerId: userId });
            if (!corp) return interaction.reply({ content: '❌ مخصص لمؤسس الشركة فقط!', ephemeral: true });

            const modal = new ModalBuilder().setCustomId('corp_rename_modal').setTitle('✏️ تعديل اسم الشركة');
            const nameInput = new TextInputBuilder().setCustomId('new_corp_name').setLabel('أدخل اسم الشركة الجديد').setStyle(TextInputStyle.Short).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
            return interaction.showModal(modal);
        }

        if (interaction.customId === 'start_survey_btn') {
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('survey_q1')
                    .setPlaceholder('🎮 1. كيف تقيّم تنوع ألعاب البوت وتفاعلها؟')
                    .addOptions([
                        { label: '⭐⭐⭐⭐⭐ ممتازة ومولعة', value: 'q1_5' },
                        { label: '⭐⭐⭐⭐ جيدة', value: 'q1_4' },
                        { label: '⭐⭐⭐ مقبولة', value: 'q1_3' },
                        { label: '⭐⭐ ضعيفة', value: 'q1_2' },
                        { label: '⭐ سيئة ومملة', value: 'q1_1' }
                    ])
            );
            return await interaction.reply({ content: `📋 **بدأنا الاستبيان (السؤال 1 من 10):**`, components: [row], ephemeral: true });
        }
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'stock_buy_modal') {
            const symbol = interaction.fields.getTextInputValue('stock_symbol').toLowerCase().trim();
            const amount = parseInt(interaction.fields.getTextInputValue('stock_amount'));
            const stock = stockMarket.find(s => s.id === symbol);
            if (!stock || isNaN(amount) || amount <= 0) return interaction.reply({ content: '❌ بيانات غير صحيحة.', ephemeral: true });

            let user = await getEconomyUser(guildId, userId);
            const totalCost = stock.price * amount;
            if (user.balance < totalCost) return interaction.reply({ content: '💸 رصيدك لا يكفي!', ephemeral: true });

            user.balance -= totalCost;
            if (!user.stocks) user.stocks = {};
            user.stocks[symbol] = (user.stocks[symbol] || 0) + amount;
            await saveEconomyUser(guildId, userId, user);

            return interaction.reply({ content: `✅ اشتريت \`${amount}\` سهم من ${stock.name} بـ \`$${totalCost.toLocaleString()}\``, ephemeral: true });
        }

        if (interaction.customId === 'stock_sell_modal') {
            const symbol = interaction.fields.getTextInputValue('stock_symbol').toLowerCase().trim();
            const amount = parseInt(interaction.fields.getTextInputValue('stock_amount'));
            let user = await getEconomyUser(guildId, userId);

            if (!user.stocks || !user.stocks[symbol] || user.stocks[symbol] < amount) {
                return interaction.reply({ content: '❌ لا تمتلك هذا العدد من الأسهم!', ephemeral: true });
            }

            const stock = stockMarket.find(s => s.id === symbol);
            const totalEarned = stock.price * amount;
            user.stocks[symbol] -= amount;
            if (user.stocks[symbol] <= 0) delete user.stocks[symbol];
            user.balance += totalEarned;
            await saveEconomyUser(guildId, userId, user);

            return interaction.reply({ content: `🤝 بعت \`${amount}\` سهم من ${stock.name} واستلمت \`$${totalEarned.toLocaleString()}\``, ephemeral: true });
        }

        if (interaction.customId === 'corp_donate_modal') {
            const amount = parseInt(interaction.fields.getTextInputValue('donate_amount'));
            if (isNaN(amount) || amount <= 0) return interaction.reply({ content: '❌ مبلغ غير صحيح.', ephemeral: true });

            let user = await getEconomyUser(guildId, userId);
            if (user.balance < amount) return interaction.reply({ content: '💸 رصيدك لا يكفي للتبرع بهذا المبلغ!', ephemeral: true });

            let corp = await guildsColl.findOne({ guildId, members: userId });
            if (!corp) return interaction.reply({ content: '❌ أنت لست في شركة!', ephemeral: true });

            user.balance -= amount;
            await saveEconomyUser(guildId, userId, user);
            await guildsColl.updateOne({ _id: corp._id }, { $inc: { capital: amount } });

            return interaction.reply({ content: `✅ تم التبرع بـ \`$${amount.toLocaleString()}\` لدعم رأس مال شركة **${corp.name}** بنجاح! 📈🔥`, ephemeral: true });
        }

        if (interaction.customId === 'corp_invite_modal') {
            const targetId = interaction.fields.getTextInputValue('invite_user_id').trim();
            let corp = await guildsColl.findOne({ guildId, ownerId: userId });
            if (!corp) return interaction.reply({ content: '❌ مخصص لمؤسس الشركة فقط!', ephemeral: true });
            if (corp.members.includes(targetId)) return interaction.reply({ content: '⚠️ هذا العضو موجود في شركتك مسبقاً!', ephemeral: true });
            if (corp.members.length >= 5) return interaction.reply({ content: '❌ وصلت الشركة للحد الأقصى (5 أعضاء)!', ephemeral: true });

            await guildsColl.updateOne({ _id: corp._id }, { $push: { members: targetId } });
            return interaction.reply({ content: `✅ تمت إضافة العضو (<@${targetId}>) بنجاح إلى شركة **${corp.name}**! 🤝🏢`, ephemeral: true });
        }

        if (interaction.customId === 'corp_logo_modal') {
            const logoUrl = interaction.fields.getTextInputValue('new_logo_url').trim();
            let corp = await guildsColl.findOne({ guildId, ownerId: userId });
            if (!corp) return interaction.reply({ content: '❌ مخصص لمؤسس الشركة فقط!', ephemeral: true });

            await guildsColl.updateOne({ _id: corp._id }, { $set: { image: logoUrl } });
            return interaction.reply({ content: `✅ تم تحديث شعار وصورة شركة **${corp.name}** بنجاح! 🖼️✨`, ephemeral: true });
        }

        if (interaction.customId === 'corp_rename_modal') {
            const newName = interaction.fields.getTextInputValue('new_corp_name').trim();
            let corp = await guildsColl.findOne({ guildId, ownerId: userId });
            if (!corp) return interaction.reply({ content: '❌ مخصص لمؤسس الشركة فقط!', ephemeral: true });

            let existing = await guildsColl.findOne({ guildId, name: newName });
            if (existing) return interaction.reply({ content: '❌ اسم الشركة الجديد مستخدم مسبقاً!', ephemeral: true });

            await guildsColl.updateOne({ _id: corp._id }, { $set: { name: newName } });
            return interaction.reply({ content: `✅ تم تعديل اسم الشركة بنجاح إلى: **${corp.logo} ${newName}** 🏢✨`, ephemeral: true });
        }

        if (interaction.customId === 'survey_suggestion_modal') {
            const suggestionText = interaction.fields.getTextInputValue('user_suggestion_text').trim();

            if (surveyColl) {
                await surveyColl.updateOne(
                    { userId }, 
                    { $set: { suggestion: suggestionText, completedAt: Date.now() } },
                    { upsert: true }
                );
            }

            return interaction.reply({
                content: `🎉 **شكراً لك يا ${interaction.user.displayName || interaction.user.username}!**\nتم اكتمال الاستبيان وحفظ إجاباتك واقتراحك بنجاح. يعطيك العافية على دعمك المستمر لـ 𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞! 🚀❤️`,
                ephemeral: true
            });
        }
    }

    if (!interaction.isStringSelectMenu()) return;

    if (interaction.customId === 'market_buy_select') {
        const selectedId = parseInt(interaction.values[0].replace('buy_', ''));
        const item = marketItems.find(i => i.id === selectedId);
        let user = await getEconomyUser(guildId, userId);

        if (user.balance < item.price) return interaction.reply({ content: '💸 رصيدك ما يكفي!', ephemeral: true });

        user.balance -= item.price;
        user.properties.push(selectedId);
        await saveEconomyUser(guildId, userId, user);
        await interaction.update({ content: `🎉 شريت **${item.name}** بـ \`$${item.price.toLocaleString()}\`!`, components: [] });
    }

    if (interaction.customId === 'market_sell_select') {
        const idx = parseInt(interaction.values[0].replace('sell_prop_', ''));
        let user = await getEconomyUser(guildId, userId);

        if (isNaN(idx) || idx < 0 || idx >= user.properties.length) {
            return interaction.reply({ content: '❌ حدث خطأ، هذا العقار غير موجود في محفظتك.', ephemeral: true });
        }

        const item = marketItems.find(i => i.id === user.properties[idx]);
        const sellP = Math.floor(item.price * 0.90);
        user.properties.splice(idx, 1);
        user.balance += sellP;
        await saveEconomyUser(guildId, userId, user);

        return interaction.update({
            content: `🤝 **تمت عملية البيع بنجاح!**\n• العقار المباع: ${item.emoji} **${item.name}**\n• المبلغ المستلم: \`$${sellP.toLocaleString()}\` (بعد خصم 10% رسوم سوق) 💵✨`,
            components: []
        });
    }

    if (interaction.customId === 'corp_buy_asset_select') {
        const assetId = parseInt(interaction.values[0].replace('buy_asset_', ''));
        const assetItem = corpAssetsMarket.find(a => a.id === assetId);

        let corp = await guildsColl.findOne({ guildId, ownerId: userId });
        if (!corp) {
            return interaction.reply({ content: '❌ عذراً، شراء مشاريع وأصول الشركة مخصص لمؤسس الشركة (المالك) فقط!', ephemeral: true });
        }

        if ((corp.capital || 0) < assetItem.price) {
            return interaction.reply({ content: `💸 رأس مال الشركة الحالي ($\`${(corp.capital || 0).toLocaleString()}\`) لا يكفي لشراء هذا المشروع (\`$${assetItem.price.toLocaleString()}\`)!`, ephemeral: true });
        }

        await guildsColl.updateOne(
            { _id: corp._id },
            { 
                $inc: { capital: -assetItem.price },
                $push: { assets: assetId }
            }
        );

        return interaction.update({
            content: `🎉 **تم شراء المشروع بنجاح لصالح شركة ${corp.name}!**\n• المشروع المشتري: ${assetItem.emoji} **${assetItem.name}**\n• التكلفة الخصومة من رأس المال: \`$${assetItem.price.toLocaleString()}\`\n• الربح الساعي المضاف: \`$${assetItem.profit.toLocaleString()}\` 📈🔥`,
            components: []
        });
    }

    if (interaction.customId === 'job_select_menu') {
        const jobKey = interaction.values[0].replace('job_', '');
        const targetJob = jobsList[jobKey];
        let pUser = await getPointsUser(guildId, userId, interaction.user.displayName || interaction.user.username);

        if (pUser.level < targetJob.level) return interaction.reply({ content: `⛔ يتطلب Level ${targetJob.level}`, ephemeral: true });

        let user = await getEconomyUser(guildId, userId);
        user.job = targetJob.name;
        await saveEconomyUser(guildId, userId, user);
        await interaction.update({ content: `🎉 تم تعيينك في وظيفة **${user.job}** بنجاح!`, components: [] });
    }

    if (interaction.customId.startsWith('survey_q')) {
        const qId = interaction.customId;
        const val = interaction.values[0];

        // حفظ إجابة السؤال في قاعدة البيانات فوراً
        await surveyColl.updateOne(
            { userId }, 
            { $set: { [qId]: val, date: Date.now() } }, 
            { upsert: true }
        );

        if (qId === 'survey_q1') {
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('survey_q2')
                    .setPlaceholder('⚡ 2. هل ألعاب السرعة وردة الفعل ممتعة وتستاهل النقاط؟')
                    .addOptions([
                        { label: 'نعم، ممتعة جداً', value: 'q2_yes' },
                        { label: 'لا، غير مهتم بها', value: 'q2_no' },
                        { label: 'تحتاج تعديل وتحسين', value: 'q2_edit' }
                    ])
            );
            return interaction.update({ content: `📋 **(السؤال 2 من 10):**`, components: [row] });
        }
        if (qId === 'survey_q2') {
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('survey_q3')
                    .setPlaceholder('🛠️ 3. هل تواجه أخطاء أو تعليق (Lag) أثناء اللعب؟')
                    .addOptions([
                        { label: 'نعم دائماً', value: 'q3_always' },
                        { label: 'أحياناً', value: 'q3_sometimes' },
                        { label: 'أبداً ما واجهت', value: 'q3_never' }
                    ])
            );
            return interaction.update({ content: `📋 **(السؤال 3 من 10):**`, components: [row] });
        }
        if (qId === 'survey_q3') {
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('survey_q4')
                    .setPlaceholder('💵 4. كيف تجد نظام الرواتب والوظائف الحالية؟')
                    .addOptions([
                        { label: 'ممتازة وعادلة', value: 'q4_fair' },
                        { label: 'الراتب قليل ويحتاج زيادة', value: 'q4_low' },
                        { label: 'الراتب عالي جداً', value: 'q4_high' }
                    ])
            );
            return interaction.update({ content: `📋 **(السؤال 4 من 10):**`, components: [row] });
        }
        if (qId === 'survey_q4') {
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('survey_q5')
                    .setPlaceholder('📈 5. ما رأيك في نظام سوق العقارات والبيع والشراء؟')
                    .addOptions([
                        { label: 'حماسي ومنافس بقوة', value: 'q5_great' },
                        { label: 'عادي جداً', value: 'q5_normal' },
                        { label: 'معقد أو غير مفهوم', value: 'q5_hard' }
                    ])
            );
            return interaction.update({ content: `📋 **(السؤال 5 من 10):**`, components: [row] });
        }
        if (qId === 'survey_q5') {
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('survey_q6')
                    .setPlaceholder('🛡️ 6. ما رأيك في نظام "الحارس الشخصي" وصدات السرقات؟')
                    .addOptions([
                        { label: 'نعم، مفيد ويحمي أملاكي', value: 'q6_yes' },
                        { label: 'لا، لم أستخدمه', value: 'q6_no' },
                        { label: 'يحتاج تعديل على طاقته', value: 'q6_edit' }
                    ])
            );
            return interaction.update({ content: `📋 **(السؤال 6 من 10):**`, components: [row] });
        }
        if (qId === 'survey_q6') {
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('survey_q7')
                    .setPlaceholder('🏢 7. ما رأيك في نظام الشركات والمشاريع والأرباح الساعية؟')
                    .addOptions([
                        { label: 'رهيب ويخلق هيمنة للهوامير', value: 'q7_great' },
                        { label: 'لم أشارك فيه بعد', value: 'q7_no' },
                        { label: 'لا يهمني', value: 'q7_meh' }
                    ])
            );
            return interaction.update({ content: `📋 **(السؤال 7 من 10):**`, components: [row] });
        }
        if (qId === 'survey_q7') {
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('survey_q8')
                    .setPlaceholder('💼 8. هل نظام القروض والديون يضيف جو أكشن؟')
                    .addOptions([
                        { label: 'جبار وواقعي جداً', value: 'q8_yes' },
                        { label: 'ماله داعي', value: 'q8_no' },
                        { label: 'لا أعرفه', value: 'q8_idk' }
                    ])
            );
            return interaction.update({ content: `📋 **(السؤال 8 من 10):**`, components: [row] });
        }
        if (qId === 'survey_q8') {
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('survey_q9')
                    .setPlaceholder('📊 9. كيف تقيّم نظام الأسهم العالمية والتذبذب؟')
                    .addOptions([
                        { label: 'ممتاز وممتع للتداول', value: 'q9_great' },
                        { label: 'معقد وما أفهم له', value: 'q9_hard' },
                        { label: 'يحتاج تنويع أسهم أكثر', value: 'q9_more' }
                    ])
            );
            return interaction.update({ content: `📋 **(السؤال 9 من 10):**`, components: [row] });
        }
        if (qId === 'survey_q9') {
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('survey_q10')
                    .setPlaceholder('🚀 10. هل تتفاعل مع أحداث الطفرة والانهيار الكبرى؟')
                    .addOptions([
                        { label: 'دائماً أتابعها وأستغلها', value: 'q10_always' },
                        { label: 'على صدفة', value: 'q10_sometimes' },
                        { label: 'لا تهمني', value: 'q10_no' }
                    ])
            );
            return interaction.update({ content: `📋 **(السؤال 10 من 10):**`, components: [row] });
        }
        if (qId === 'survey_q10') {
            const modal = new ModalBuilder()
                .setCustomId('survey_suggestion_modal')
                .setTitle('💡 اقتراحاتك لتطوير السيرفر');

            const suggestionInput = new TextInputBuilder()
                .setCustomId('user_suggestion_text')
                .setLabel('اقتراحاتك للتحديث القادم (اكتب بحرية)') 
                .setPlaceholder('وش أكثر ميزة، لعبة، أو فكرة ودك نضيفها في السيرفر؟')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false);

            modal.addComponents(new ActionRowBuilder().addComponents(suggestionInput));
            return interaction.showModal(modal);
        }
    }
});

client.login(DISCORD_TOKEN);
