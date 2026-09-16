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

let db, pointsColl, economyColl, guildsColl;

async function connectDB() {
    try {
        await dbClient.connect();
        db = dbClient.db('camora_zone_db');
        pointsColl = db.collection('points');
        economyColl = db.collection('economy');
        guildsColl = db.collection('corporations'); 
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
        GatewayIntentBits.GuildMembers
    ] 
});

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const activeGames = new Map(); 
const processingUsers = new Set(); 
const allowedChannels = ['1547728033580847236', '1547728346081927262', '1548010683692748821']; 
const allowedEconomyChannels = ['1547951432186077296', '1548010683692748821']; 
const allowedStockChannels = ['1549387597221068900', '1549387358343004220'];

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

// تعريف الدالة المفقودة لمنع أخطاء الكراش
async function checkAndDistributeAutoRoles(guild) {
    // دالة لتوزيع الرتب التلقائية
}

// 1. نظام الطفرة والانهيار التلقائي للأسهم
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

// نظام توزيع أرباح أصول الشركات تلقائياً كل ساعة
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

// 2. نظام فحص القروض والمتعثرين والحجز التلقائي
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

// نظام تحديث وتذبذب وطفرة/انهيار سوق العقارات كل 5 دقائق
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

    channel.send({ embeds: [embed], components: [row1, row2, row3] }).then(msg => {
        const coll = msg.createMessageComponentCollector({ time: 300000 });
        coll.on('collect', async i => {
            const action = i.customId;
            if (action === 'btn_xo') {
                await i.reply({ content: `🎮 **[لعبة XO]**\nاختر نمط اللعب يا ${i.user}:`, components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('exec_xo_bot').setLabel('🤖 ضد البوت').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('exec_xo_pvp').setLabel('👥 مع خويك').setStyle(ButtonStyle.Success)
                    )
                ], ephemeral: true });
            } else if (action === 'btn_rps') {
                await i.reply({ content: `🎮 **[لعبة حجر ورقة مقص]**\nاختر نمط اللعب يا ${i.user}:`, components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('exec_rps_bot').setLabel('🤖 ضد البوت').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('exec_rps_pvp').setLabel('👥 مع خويك').setStyle(ButtonStyle.Success)
                    )
                ], ephemeral: true });
            } else if (action === 'exec_xo_bot') {
                await i.update({ content: '🤖 بدأت لعبة XO ضد البوت:', components: [] }).catch(()=>{});
                launchXOGame(i.channel, i.guild.id, i.user, null);
            } else if (action === 'exec_xo_pvp') {
                await i.update({ content: `👥 **[لعبة XO الثنائية]**\nاكتب في الشات:\n\`!xo @اسم_خويك\``, components: [] }).catch(()=>{});
            } else if (action === 'exec_rps_bot') {
                await i.update({ content: '🤖 بدأ تحدي حجر ورقة مقص ضد البوت:', components: [] }).catch(()=>{});
                startRPSBotGame({ channel: i.channel, author: i.user }, i.guild.id);
            } else if (action === 'exec_rps_pvp') {
                await i.update({ content: `👥 **[تحدي حجر ورقة مقص الثنائي]**\nاكتب في الشات:\n\`!حجر @اسم_خويك\``, components: [] }).catch(()=>{});
            } else {
                await i.deferUpdate().catch(()=>{});
                if (action === 'btn_bomb') startBombGame(i.channel, i.guild.id);
                else if (action === 'btn_scramble') startScrambleGame(i.channel, i.guild.id);
                else if (action === 'btn_reverse') startReverseGame(i.channel, i.guild.id);
                else if (action === 'btn_emoji') startEmojiGame(i.channel, i.guild.id);
                else if (action === 'btn_trivia') startTriviaGame(i.channel, i.guild.id);
                else if (action === 'btn_penalty') startPenaltyGame({ channel: i.channel, author: i.user }, i.guild.id);
                else if (action === 'btn_mines') startMinesGame(i.channel, i.guild.id, i.user.id);
                else if (action === 'btn_race') startRaceGame(i.channel, i.guild.id, i.user.id);
                else if (action === 'btn_vault') startVaultGame(i.channel, i.guild.id, i.user.id);
                else if (action === 'btn_boxes') startBoxesGame(i.channel, i.guild.id, i.user.id);
            }
        });
    });
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
            await i.deferUpdate().catch(()=>{});
            activeGames.delete(channel.id);
            const t = ((Date.now() - start) / 1000).toFixed(2);
            await msg.edit({ content: `🏆 كفو ${i.user}! في **${t} ثانية** وكسبت **10 نقاط**!`, components: [] }).catch(()=>{});
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

function startPenaltyGame(message, guildId) {
    const channel = message.channel;
    const challenger = message.author;
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pen_left').setLabel('⬅️ يسار').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('pen_center').setLabel('⬆️ وسط').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('pen_right').setLabel('➡️ يمين').setStyle(ButtonStyle.Danger)
    );
    channel.send({ content: `⚽ **[تحدي ركلات الترجيح]**\n${challenger} يستعد لتسديد الكورة! اختر زاوية التسديد:`, components: [row] }).then(msg => {
        const coll = msg.createMessageComponentCollector({ time: 15000, max: 1 });
        coll.on('collect', async i => {
            if (i.user.id !== challenger.id) return i.reply({ content: '❌ ليست لك!', ephemeral: true });
            await i.deferUpdate().catch(()=>{});
            const botGoalie = ['left', 'center', 'right'][Math.floor(Math.random() * 3)];
            const userChoice = i.customId.replace('pen_', '');
            let res = userChoice === botGoalie ? `🥅 **تصدى لها الحارس!**` : `⚽💥 **قووووول!** كسبت **10 نقاط**!`;
            if (userChoice !== botGoalie) addPoints(guildId, challenger.id, challenger.displayName, channel);
            await msg.edit({ content: res, components: [] }).catch(()=>{});
        });
    });
}

function startMinesGame(channel, guildId, userId) {
    if (activeGames.has(channel.id)) return;
    activeGames.set(channel.id, 'mines');
    const mineIndex = Math.floor(Math.random() * 9);
    const rows = [];
    for (let r = 0; r < 3; r++) {
        const rowComps = [];
        for (let c = 0; c < 3; c++) {
            const idx = r * 3 + c;
            rowComps.push(new ButtonBuilder().setCustomId(`mine_${idx}_${idx === mineIndex ? 'boom' : 'safe'}`).setLabel(`مربع ${idx + 1}`).setStyle(ButtonStyle.Secondary));
        }
        rows.push(new ActionRowBuilder().addComponents(rowComps));
    }
    channel.send({ content: `💣 **[تحدي حقل الألغام]**\nاضغط مربعات آمنة واجمع الأرباح، واحذر من اللغم!`, components: rows }).then(msg => {
        const coll = msg.createMessageComponentCollector({ time: 30000 });
        coll.on('collect', async i => {
            if (i.user.id !== userId) return i.reply({ content: '❌ ليست لك!', ephemeral: true });
            await i.deferUpdate().catch(()=>{});
            if (i.customId.includes('boom')) {
                activeGames.delete(channel.id);
                coll.stop();
                return msg.edit({ content: `💥 **انفجر اللغم!** راحت عليك الأرباح 💀`, components: [] }).catch(()=>{});
            } else {
                i.followUp({ content: `✨ مربع آمن! استمر بالتقدم.`, ephemeral: true }).catch(()=>{});
            }
        });
    });
}

function startRaceGame(channel, guildId, userId) {
    if (activeGames.has(channel.id)) return;
    activeGames.set(channel.id, 'race');
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('race_btn').setLabel('🏎️ انطلق بأقصى سرعة!').setStyle(ButtonStyle.Success));
    channel.send({ content: `🏁 **[سباق السرعة التفاعلي]**\nأسرع شخص يضغط على زر الانطلاق 5 مرات يفوز!`, components: [row] }).then(msg => {
        let progress = new Map();
        const coll = msg.createMessageComponentCollector({ time: 15000 });
        coll.on('collect', async i => {
            await i.deferUpdate().catch(()=>{});
            let count = (progress.get(i.user.id) || 0) + 1;
            progress.set(i.user.id, count);
            if (count >= 5) {
                coll.stop();
                activeGames.delete(channel.id);
                let eco = await getEconomyUser(guildId, i.user.id);
                eco.balance += 5000;
                await saveEconomyUser(guildId, i.user.id, eco);
                addPoints(guildId, i.user.id, i.user.displayName, channel);
                return msg.edit({ content: `🏎️🏆 **فاز بالسباق ${i.user}!** وكسب **$5,000 كاش** و **10 نقاط**! 🔥`, components: [] }).catch(()=>{});
            }
            i.followUp({ content: `⚡ تقدمت في السباق (${count}/5)`, ephemeral: true }).catch(()=>{});
        });
    });
}

function startVaultGame(channel, guildId, userId) {
    if (activeGames.has(channel.id)) return;
    activeGames.set(channel.id, 'vault');
    const correctCode = Math.floor(Math.random() * 6) + 1;
    const row = new ActionRowBuilder();
    for (let i = 1; i <= 6; i++) {
        row.addComponents(new ButtonBuilder().setCustomId(`vault_${i}`).setLabel(`رقم ${i}`).setStyle(ButtonStyle.Primary));
    }
    channel.send({ content: `🏦 **[تحدي كسر خزنة البنك]**\nاختر الرقم الصحيح (بين 1 و 6):`, components: [row] }).then(msg => {
        const coll = msg.createMessageComponentCollector({ time: 15000, max: 1 });
        coll.on('collect', async i => {
            if (i.user.id !== userId) return i.reply({ content: '❌ ليست لك!', ephemeral: true });
            await i.deferUpdate().catch(()=>{});
            activeGames.delete(channel.id);
            const chosenNum = parseInt(i.customId.replace('vault_', ''));
            if (chosenNum === correctCode) {
                let eco = await getEconomyUser(guildId, userId);
                eco.balance += 15000;
                await saveEconomyUser(guildId, userId, eco);
                addPoints(guildId, userId, i.user.displayName, channel);
                await msg.edit({ content: `🔓👑 **تم فتح الخزنة بنجاح يا ${i.user}!** فزت بـ **$15,000 كاش** و **10 نقاط**! 🔥`, components: [] }).catch(()=>{});
            } else {
                await msg.edit({ content: `🔒 **إنذار البنك!** الرقم الصحيح كان (${correctCode}). هاردلك! 🚨💀`, components: [] }).catch(()=>{});
            }
        });
    });
}

client.once('clientReady', () => {
  console.log(`[BOT STATUS] Camora Zone is Online & Secured with MongoDB Atlas! 🚀`);
  client.user.setActivity('𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞', { type: ActivityType.Playing });

  setInterval(() => {
      client.guilds.cache.forEach(guild => {
          checkAndDistributeAutoRoles(guild);
      });
  }, 10 * 60 * 1000);
});

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

  if (message.content.startsWith('!اعلان-تحديث')) {
      if (!message.member.permissions.has('ManageMessages')) {
          return message.reply('❌ عذراً، هذا الأمر مخصص للإدارة فقط!');
      }

      const args = message.content.replace('!اعلان-تحديث', '').trim().split(' ');
      const targetChannelId = args[0];
      const gameName = args[1];
      const gameCommand = args[2];

      if (!targetChannelId || !gameName || !gameCommand) {
          return message.reply('❌ الاستخدام الصحيح:\n`!اعلان-تحديث [آيدي_الروم] [اسم_اللعبة] [أمر_التشغيل]`\nمثال: `!اعلان-تحديث 123456789 حقل_الألغام !ألغام`');
      }

      try {
          const targetChannel = await client.channels.fetch(targetChannelId);
          if (!targetChannel || !targetChannel.isTextBased()) {
              return message.reply('❌ آيدي الروم غير صحيح أو أنه ليس روم كتابي!');
          }

          await message.delete().catch(() => {});

          const updateEmbed = new EmbedBuilder()
              .setColor('#2ECC71')
              .setTitle('🚀 تحديث جديد في قسم الألعاب!')
              .setDescription(`تم تحديث وتطوير لعبة **${gameName}** وإضافة مميزات جديدة جربها الان!`)
              .addFields(
                  { name: '🎮 لتجربة اللعبة الآن', value: `اكتب الأمر التالي في الشات:\n\`${gameCommand}\``, inline: false },
                  { name: '📌 الحالة', value: '`🟢 جاهزة للعب وبدون أخطاء`', inline: true }
              )
              .setFooter({ text: '𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞 • نظام تحديثات السيرفر' })
              .setTimestamp();

          await targetChannel.send({ 
              content: '🔔 **تنبيه تحديث لعبة جديدة!**', 
              embeds: [updateEmbed] 
          });

          return message.author.send(`✅ تم إرسال إعلان تحديث لعبة (${gameName}) إلى الروم <#${targetChannelId}> بنجاح!`).catch(() => {});
      } catch (err) {
          console.error(err);
          return message.reply('❌ حدث خطأ أثناء محاولة إرسال الإعلان، تأكد من آيدي الروم وصلاحيات البوت.');
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
          if (user.balance < 3000) return message.reply('📦 سعر الصندوق السري **$3,000** ورصيدك ما يكفي!');
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
          else if (r === 10) startRPSBotGame(message.channel, guildId);
          else if (r === 11) startPenaltyGame(message.channel, guildId);
          else if (r === 12) startMinesGame(message.channel, guildId, userId);
          else if (r === 13) startRaceGame(message.channel, guildId, userId);
          else if (r === 14) startVaultGame(message.channel, guildId, userId);
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
      if (text.startsWith('!حجر') || text.startsWith('حجر')) {
          const opponent = message.mentions.users.first();
          if (opponent && !opponent.bot && opponent.id !== userId) launchRPSPvPGame(message.channel, guildId, message.author, opponent);
          else startRPSBotGame(message, guildId);
          return;
      }
      if (text.startsWith('!xo') || text.startsWith('xo')) return startXOGame(message, guildId);
      if (text.startsWith('!ذاكرة') || text.startsWith('ذاكرة')) return startMemoryGame(message, guildId);
      if (text.startsWith('!بلنتي') || text.startsWith('بلنتي')) return startPenaltyGame(message, guildId);
      if (text === '!ألغام' || text === 'ألغام') return startMinesGame(message.channel, guildId, userId);
      if (text === '!سباق' || text === 'سباق') return startRaceGame(message.channel, guildId, userId);
      if (text === '!خزنة' || text === 'خزنة') return startVaultGame(message.channel, guildId, userId);
      if (text === '!صناديق' || text === 'صناديق') return startBoxesGame(message.channel, guildId, userId);

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

      if (message.content === '!ايقاف' || message.content === '!إيقاف') {
          activeGames.delete(message.channel.id);
          return message.channel.send('🛑 **تم إيقاف اللعبة الجارية بنجاح!**');
      }
  }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

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
    }

    if (interaction.isModalSubmit()) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

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
    }

    if (!interaction.isStringSelectMenu()) return;

    if (interaction.customId === 'market_buy_select') {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
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
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
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
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
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
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const jobKey = interaction.values[0].replace('job_', '');
        const targetJob = jobsList[jobKey];
        let pUser = await getPointsUser(guildId, userId, interaction.user.displayName);

        if (pUser.level < targetJob.level) return interaction.reply({ content: `⛔ يتطلب Level ${targetJob.level}`, ephemeral: true });

        let user = await getEconomyUser(guildId, userId);
        user.job = targetJob.name;
        await saveEconomyUser(guildId, userId, user);
        await interaction.update({ content: `🎉 تم تعيينك في وظيفة **${user.job}** بنجاح!`, components: [] });
    }
});

client.login(DISCORD_TOKEN);
