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

// تحديث البورصة كل 5 دقائق
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
    if (!economyColl) return { guildId, userId, balance: 1500, properties: [], job: 'مواطن 🇸🇦', lastWork: 0, lastProfit: 0, lastCrime: 0, lastQuest: 0, questsCompleted: 0, lastBox: 0 };
    let doc = await economyColl.findOne({ guildId, userId });
    if (!doc) {
        doc = { guildId, userId, balance: 1500, properties: [], job: 'مواطن 🇸🇦', lastWork: 0, lastProfit: 0, lastCrime: 0, lastQuest: 0, questsCompleted: 0, lastBox: 0 };
        await economyColl.insertOne(doc);
    }
    if (!doc.job) doc.job = 'مواطن 🇸🇦';
    if (doc.lastBox === undefined) doc.lastBox = 0;
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
    { q: 'ما هو عنصر الكيمياء الذي يرمز له بـ H2O؟', ans: 'ماء' }, { q: 'في أي قارة تقع دولة مصر؟', ans: 'افريقيا' },
    { q: 'ما هي أكبر دولة في العالم من حيث المساحة؟ ', ans: 'روسيا' }, { q: 'ما هو أطول نهر في العالم؟', ans: 'نهر النيل' },
    { q: 'كم عدد القارات في العالم؟ ', ans: '7 قارات' }, { q: 'ما هو الغاز الذي يشكل النسبة الكبرى من الغلاف الجوي للأرض؟', ans: 'غاز النيتروجين' },
    { q: 'ما هو الكوكب المعروف باسم "الكوكب الأحمر"؟ ', ans: 'كوكب المريخ' }, { q: 'ما هو المعدن الوحيد الذي يكون في الحالة السائلة في درجة حرارة الغرفة؟', ans: 'الزئبق' },
    { q: 'ما هو العضو الذي يستهلك أكبر قدر من الطاقة في جسم الإنسان؟ ', ans: 'الدماغ' }, { q: 'في أي عام بدأت الحرب العالمية الثانية؟', ans: '1939' },
    { q: 'في أي دولة أقيمت أول بطولة لكأس العالم لكرة القدم؟ ', ans: 'الأوروغواي' }, { q: 'كم عدد اللاعبين الأساسيين في فريق كرة السلة؟', ans: '5' },
    { q: 'ما هي الرياضة التي تُعرف بلقب "رياضة الملوك"؟ ', ans: 'الفروسية' }
];

const capitalMasterPool = [
    { c: 'السعودية', cap: 'الرياض' }, { c: 'الإمارات', cap: 'ابوظبي' }, { c: 'الكويت', cap: 'الكويت' },
    { c: 'مصر', cap: 'القاهرة' }, { c: 'قطر', cap: 'الدوحة' }, { c: 'عمان', cap: 'مسقط' },
    { c: 'البحرين', cap: 'المنامة' }, { c: 'الأردن', cap: 'عمان' }, { c: 'العراق', cap: 'بغداد' }, { c: 'لبنان', cap: 'بيروت' },
    { c: 'المغرب', cap: 'الرباط' }, { c: 'تركيا', cap: 'أنقرة' }, { c: 'بريطانيا', cap: 'لندن' }, { c: 'فرنسا', cap: 'باريس' },
    { c: 'إسبانيا', cap: 'مدريد' }, { c: 'ألمانيا', cap: 'برلين' }, { c: 'إندونيسيا', cap: 'جاكرتا' }, { c: 'إيطاليا', cap: 'روما' },
    { c: 'روسيا', cap: 'موسكو' }, { c: 'كندا', cap: 'أوتاوا' }, { c: 'البرازيل', cap: 'برازيليا' }, { c: 'أستراليا', cap: 'كانبرا' },
    { c: 'الولايات المتحدة الأمريكية', cap: 'واشنطن' }, { c: 'ماليزيا', cap: 'كوالالمبور' }, { c: 'كوريا الجنوبية', cap: 'سيؤول' }, { c: 'فلسطين', cap: 'القدس' }
];

client.once('clientReady', () => {
  console.log(`[BOT STATUS] Camora Zone is Online & Secured with MongoDB Atlas! 🎮`);
  client.user.setActivity('𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞', { type: ActivityType.Playing });
});

// قائمة الألعاب النصية ومعها صفين كاملة من الأزرار تحتها لكل الألعاب
function sendGamesMenu(channel) {
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🎮 قائمة ألعاب وقوائم 𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞')
        .addFields(
            { name: '🔪 الألعاب اليدوية والفعاليات', value: '`!القاتل` | `!xo [@شخص]` | `!حجر [@شخص]` | `!روليت` | `!قنبلة` | `!فكك` | `!عكس` | `!إيموجي` | `!معنى` | `!تخمين` | `!ذكاء` | `!رياضيات` | `!عواصم` | `!زر` | `!كتابة`', inline: false },
            { name: '🧠 لعبة الذاكرة (مستويات)', value: '`!ذاكرة سهل` | `!ذاكرة متوسط` | `!ذاكرة صعب`', inline: false },
            { name: '⚡ الألعاب التفاعلية والفخمة', value: '`!بلنتي` | `!ألغام` | `!سباق` | `!خزنة` | `!صناديق`', inline: false },
            { name: '🎲 الفعاليات والعشوائي', value: '`!فعالية` | `!العاب`', inline: false },
            { name: '🏆 لوحة الصدارة', value: '`!ت`', inline: false }
        )
        .setFooter({ text: '🛑 لإلغاء أي لعبة جارية اكتب: !ايقاف' });

    // صف الأزرار الأول (الألعاب الكبرى والتفاعلية)
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_xo').setLabel('❌ XO').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_rps').setLabel('🪨 حجر ورقة مقص').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('btn_bomb').setLabel('💣 قنبلة').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('btn_roulette').setLabel('🔫 روليت').setStyle(ButtonStyle.Danger)
    );

    // صف الأزرار الثاني (الألعاب السريعة والذكاء)
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_scramble').setLabel('🧩 فكك').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_reverse').setLabel('🔄 عكس').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_emoji').setLabel('😀 إيموجي').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_trivia').setLabel('🧠 ذكاء').setStyle(ButtonStyle.Secondary)
    );

    // صف الأزرار الثالث (الألعاب التفاعلية والصناديق)
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_penalty').setLabel('⚽ بلنتي').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_mines').setLabel('⚠️ ألغام').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_race').setLabel('🏎️ سباق').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('btn_vault').setLabel('🏦 خزنة').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('btn_boxes').setLabel('📦 صناديق').setStyle(ButtonStyle.Success)
    );

    channel.send({ embeds: [embed], components: [row1, row2, row3] }).then(msg => {
        const coll = msg.createMessageComponentCollector({ time: 300000 }); // تبقى الأزرار شغالـة 5 دقائق
        
        coll.on('collect', async i => {
            const action = i.customId.replace('btn_', '');

            if (action === 'xo') {
                await i.reply({ content: `🎮 **[لعبة XO]**\nاختر نمط اللعب يا ${i.user}:`, components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('exec_xo_bot').setLabel('🤖 ضد البوت').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('exec_xo_pvp').setLabel('👥 مع خويك').setStyle(ButtonStyle.Success)
                    )
                ], ephemeral: true });
            } else if (action === 'rps') {
                await i.reply({ content: `🎮 **[لعبة حجر ورقة مقص]**\nاختر نمط اللعب يا ${i.user}:`, components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('exec_rps_bot').setLabel('🤖 ضد البوت').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('exec_rps_pvp').setLabel('👥 مع خويك').setStyle(ButtonStyle.Success)
                    )
                ], ephemeral: true });
            } else if (action === 'exec_xo_bot') {
                await i.deferUpdate().catch(()=>{});
                launchXOGame(i.channel, i.guild.id, i.user, null);
            } else if (action === 'exec_xo_pvp') {
                await i.update({ content: `👥 **[لعبة XO الثنائية]**\nمنشن خويك في الشات الآن (مثال: @شخص) لبدء التحدي!`, components: [] });
                const mColl = i.channel.createMessageCollector({ filter: m => m.author.id === i.user.id, time: 20000, max: 1 });
                mColl.on('collect', async m => {
                    const opponent = m.mentions.users.first();
                    if (!opponent || opponent.bot || opponent.id === i.user.id) {
                        return i.channel.send('❌ لم تقم بمنشن شخص صحيح! إلغاء التحدي.');
                    }
                    launchXOGame(i.channel, i.guild.id, i.user, opponent);
                });
            } else if (action === 'exec_rps_bot') {
                await i.deferUpdate().catch(()=>{});
                startRPSBotGame({ channel: i.channel, author: i.user }, i.guild.id);
            } else if (action === 'exec_rps_pvp') {
                await i.update({ content: `👥 **[تحدي حجر ورقة مقص الثنائي]**\nمنشن خويك في الشات الآن لبدء التحدي!`, components: [] });
                const mColl = i.channel.createMessageCollector({ filter: m => m.author.id === i.user.id, time: 20000, max: 1 });
                mColl.on('collect', async m => {
                    const opponent = m.mentions.users.first();
                    if (!opponent || opponent.bot || opponent.id === i.user.id) {
                        return i.channel.send('❌ لم تقم بمنشن شخص صحيح! إلغاء التحدي.');
                    }
                    launchRPSPvPGame(i.channel, i.guild.id, i.user, opponent);
                });
            } else {
                // باقي الألعاب تبدأ بضغطة زر واحدة مباشرة
                await i.deferUpdate().catch(()=>{});
                if (action === 'bomb') startBombGame(i.channel, i.guild.id);
                if (action === 'roulette') {
                    if (activeGames.has(i.channel.id)) return i.followUp({ content: '⏳ فيه لعبة شغالة!', ephemeral: true });
                    activeGames.set(i.channel.id, 'roulette');
                    setTimeout(() => {
                        activeGames.delete(i.channel.id);
                        if (Math.floor(Math.random() * 6) + 1 === 1) i.channel.send(`💥 **بووووم!** ${i.user} خسر 💀.`);
                        else { i.channel.send(`😅 المسدس فاضي! كسبت **10 نقاط** يا ${i.user}.`); addPoints(i.guild.id, i.user.id, i.user.displayName, i.channel); }
                    }, 3000);
                }
                if (action === 'scramble') startScrambleGame(i.channel, i.guild.id);
                if (action === 'reverse') startReverseGame(i.channel, i.guild.id);
                if (action === 'emoji') startEmojiGame(i.channel, i.guild.id);
                if (action === 'trivia') startTriviaGame(i.channel, i.guild.id);
                if (action === 'penalty') startPenaltyGame({ channel: i.channel, author: i.user }, i.guild.id);
                if (action === 'mines') startMinesGame(i.channel, i.guild.id, i.user.id);
                if (action === 'race') startRaceGame(i.channel, i.guild.id, i.user.id);
                if (action === 'vault') startVaultGame(i.channel, i.guild.id, i.user.id);
                if (action === 'boxes') startBoxesGame(i.channel, i.guild.id, i.user.id);
            }
        });
    });
}

// دوال الألعاب اليدوية الكلاسيكية
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

function startMemoryGame(message, guildId) {
    const channel = message.channel;
    const contentLower = message.content.toLowerCase();
    
    let difficulty = 'سهل';
    if (contentLower.includes('صعب')) difficulty = 'صعب';
    else if (contentLower.includes('متوسط')) difficulty = 'متوسط';

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

    channel.send({ content: `🧠 **[لعبة الذاكرة - مستوى ${difficulty}]**\nاللاعب: ${challenger}`, components: getBoardComponents() }).then(msg => {
        const coll = msg.createMessageComponentCollector({ time: 45000 });
        coll.on('collect', async i => {
            if (i.user.id !== challenger.id) return i.reply({ content: '❌ ليست لك!', ephemeral: true });
            await i.deferUpdate().catch(()=>{});
            const idx = parseInt(i.customId.replace('mem_', ''));
            if (revealed[idx] || matched[idx]) return;
            revealed[idx] = true;
            if (firstSelection === null) {
                firstSelection = idx;
                await msg.edit({ content: `🧠 **[لعبة الذاكرة - مستوى ${difficulty}]**`, components: getBoardComponents() }).catch(()=>{});
            } else {
                const fIdx = firstSelection; firstSelection = null;
                if (deck[fIdx] === deck[idx]) {
                    matched[fIdx] = true; matched[idx] = true;
                    if (matched.every((m, index) => m || index >= deck.length)) {
                        coll.stop();
                        addPoints(guildId, challenger.id, challenger.displayName, channel);
                        return msg.edit({ content: `🏆 **انتهت اللعبة! كفو ${challenger}** كسبت **10 نقاط**! 🌟`, components: getBoardComponents(true) }).catch(()=>{});
                    }
                    await msg.edit({ content: `🧠 **[لعبة الذاكرة - مستوى ${difficulty}]**\n✨ تطابق صحيح!`, components: getBoardComponents() }).catch(()=>{});
                } else {
                    await msg.edit({ content: `🧠 **[لعبة الذاكرة - مستوى ${difficulty}]**\n❌ خطأ!`, components: getBoardComponents() }).catch(()=>{});
                    setTimeout(async () => { 
                        revealed[fIdx] = false; revealed[idx] = false; 
                        await msg.edit({ content: `🧠 **[لعبة الذاكرة - مستوى ${difficulty}]**`, components: getBoardComponents() }).catch(()=>{}); 
                    }, 1500);
                }
            }
        });
    });
}

function startRPSBotGame(message, guildId) {
    const channel = message.channel;
    const challenger = message.author;
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rps_rock').setLabel('🪨 حجر').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('rps_paper').setLabel('📄 ورقة').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('rps_scissors').setLabel('✂️ مقص').setStyle(ButtonStyle.Danger)
    );
    channel.send({ content: `🤖 **[تحدي حجر ورقة مقص ضد البوت الذكي]**\nاختر حركتك:`, components: [row] }).then(msg => {
        const coll = msg.createMessageComponentCollector({ time: 15000, max: 1 });
        coll.on('collect', async i => {
            if (i.user.id !== challenger.id) return i.reply({ content: '❌ ليست لك!', ephemeral: true });
            await i.deferUpdate().catch(()=>{});
            const userChoice = i.customId.replace('rps_', '');
            const smartMoves = { rock: 'paper', paper: 'scissors', scissors: 'rock' };
            const botChoice = Math.random() < 0.65 ? smartMoves[userChoice] : ['rock', 'paper', 'scissors'][Math.floor(Math.random() * 3)];
            let res = userChoice === botChoice ? `🤝 **تعادل ذكي!**` : (((userChoice === 'rock' && botChoice === 'scissors') || (userChoice === 'paper' && botChoice === 'rock') || (userChoice === 'scissors' && botChoice === 'paper')) ? `🎉 **كفو فزت على البوت!** كسبت **10 نقاط**!` : `🧠 **هزمك البوت الذكي!**`);
            if (res.includes('فزت')) addPoints(guildId, challenger.id, challenger.displayName, channel);
            await msg.edit({ content: res, components: [] }).catch(()=>{});
        });
    });
}

function launchRPSPvPGame(channel, guildId, challenger, opponent) {
    let choices = {};
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('p_rock').setLabel('🪨 حجر').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('p_paper').setLabel('📄 ورقة').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('p_scissors').setLabel('✂️ مقص').setStyle(ButtonStyle.Danger)
    );

    channel.send({ content: `⚔️ **[تحدي حجر ورقة مقص الثنائي]**\nبين ${challenger} و ${opponent}\nكل لاعب يختار حركته بسرية عبر الأزرار:`, components: [row] }).then(msg => {
        const coll = msg.createMessageComponentCollector({ time: 20000 });
        
        coll.on('collect', async i => {
            if (i.user.id !== challenger.id && i.user.id !== opponent.id) {
                return i.reply({ content: '❌ هذه اللعبة ليست لك!', ephemeral: true });
            }
            if (choices[i.user.id]) {
                return i.reply({ content: '⚠️ لقد اخترت مسبقاً، انتظر خصمك!', ephemeral: true });
            }

            choices[i.user.id] = i.customId.replace('p_', '');
            await i.reply({ content: `✅ تم تسجيل اختيارك بنجاح!`, ephemeral: true });

            if (choices[challenger.id] && choices[opponent.id]) {
                coll.stop();
                const c1 = choices[challenger.id];
                const c2 = choices[opponent.id];
                const names = { rock: 'حجر 🪨', paper: 'ورقة 📄', scissors: 'مقص ✂️' };

                let resultText = `🎮 **نتيجة التحدي بين ${challenger} و ${opponent}:**\n`;
                resultText += `${challenger} اختر: **${names[c1]}**\n`;
                resultText += `${opponent} اختر: **${names[c2]}**\n\n`;

                if (c1 === c2) {
                    resultText += `🤝 **تعادل بين اللاعبين!**`;
                } else if (
                    (c1 === 'rock' && c2 === 'scissors') ||
                    (c1 === 'paper' && c2 === 'rock') ||
                    (c1 === 'scissors' && c2 === 'paper')
                ) {
                    resultText += `🎉 **كفو الفائز هو ${challenger}** وكسب **10 نقاط**! 🌟`;
                    addPoints(guildId, challenger.id, challenger.displayName, channel);
                } else {
                    resultText += `🎉 **كفو الفائز هو ${opponent}** وكسب **10 نقاط**! 🌟`;
                    addPoints(guildId, opponent.id, opponent.displayName, channel);
                }

                await msg.edit({ content: resultText, components: [] }).catch(()=>{});
            }
        });
    });
}

function startXOGame(message, guildId) {
    const channel = message.channel;
    const challenger = message.author;
    const opponent = message.mentions ? message.mentions.users.first() : null;

    if (opponent && (opponent.bot || opponent.id === challenger.id)) {
        return message.reply ? message.reply('❌ لا يمكنك تحدي بوت أو نفسك!') : channel.send('❌ لا يمكنك تحدي بوت أو نفسك!');
    }

    launchXOGame(channel, guildId, challenger, opponent);
}

function launchXOGame(channel, guildId, challenger, opponent, oldMsg = null) {
    let board = Array(9).fill(null);
    let currentPlayer = challenger.id;

    const checkWin = (b) => {
        const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
        for (let w of wins) { if (b[w[0]] && b[w[0]] === b[w[1]] && b[w[0]] === b[w[2]]) return b[w[0]]; }
        if (b.every(cell => cell !== null)) return 'tie';
        return null;
    };

    const getBotMove = (b) => {
        const emptyIndices = b.map((val, idx) => val === null ? idx : null).filter(val => val !== null);
        for (let idx of emptyIndices) { let temp = [...b]; temp[idx] = 'O'; if (checkWin(temp) === 'O') return idx; }
        for (let idx of emptyIndices) { let temp = [...b]; temp[idx] = 'X'; if (checkWin(temp) === 'X') return idx; }
        if (b[4] === null) return 4;
        return emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
    };

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

    const titleText = opponent ? `🎮 **[تحدي XO الثنائي]** بين ${challenger} و ${opponent}\nدور اللاعب: <@${currentPlayer}> (❌)` : `🎮 **[تحدي XO ضد البوت الذكي]**\nدورك (❌):`;

    const sendMethod = oldMsg ? oldMsg.edit.bind(oldMsg) : channel.send.bind(channel);
    sendMethod({ content: titleText, components: getBoardComponents() }).then(msg => {
        const coll = msg.createMessageComponentCollector({ time: 60000 });
        coll.on('collect', async i => {
            const p1 = challenger.id;
            const p2 = opponent ? opponent.id : client.user.id;

            if (i.user.id !== currentPlayer && i.user.id !== p1 && i.user.id !== p2) {
                return i.reply({ content: '❌ هذه اللعبة ليست لك!', ephemeral: true });
            }
            if (i.user.id !== currentPlayer) {
                return i.reply({ content: '⏳ ليس دورك!', ephemeral: true });
            }

            await i.deferUpdate().catch(()=>{});
            const idx = parseInt(i.customId.replace('xo_', ''));
            if (board[idx] !== null) return;

            const symbol = currentPlayer === p1 ? 'X' : 'O';
            board[idx] = symbol;

            let winner = checkWin(board);
            if (winner) {
                coll.stop();
                let txt = '';
                if (winner === 'tie') txt = `🤝 **تعادل في XO!**`;
                else if (winner === 'X') {
                    txt = `🎉 **كفو فزت يا ${challenger} في XO** وكسبت **10 نقاط**! 🌟`;
                    addPoints(guildId, challenger.id, challenger.displayName, channel);
                } else {
                    txt = opponent ? `🎉 **كفو فزت يا ${opponent} في XO** وكسبت **10 نقاط**! 🌟` : `🤖 **هزمك البوت الذكي في XO!** 💀`;
                    if (opponent) addPoints(guildId, opponent.id, opponent.displayName, channel);
                }
                return msg.edit({ content: txt, components: getBoardComponents(true) }).catch(()=>{});
            }

            currentPlayer = currentPlayer === p1 ? p2 : p1;

            if (!opponent && currentPlayer === client.user.id) {
                const botIdx = getBotMove(board);
                if (botIdx !== undefined) {
                    board[botIdx] = 'O';
                    winner = checkWin(board);
                    if (winner) {
                        coll.stop();
                        let txt = winner === 'O' ? `🤖 **هزمك البوت الذكي في XO!** 💀` : `🤝 **تعادل!**`;
                        return msg.edit({ content: txt, components: getBoardComponents(true) }).catch(()=>{});
                    }
                    currentPlayer = p1;
                }
            }

            const nextTitle = opponent ? `🎮 **[تحدي XO الثنائي]** بين ${challenger} و ${opponent}\nدور اللاعب: <@${currentPlayer}> (${currentPlayer === p1 ? '❌' : '⭕'})` : `🎮 **[تحدي XO ضد البوت الذكي]**\nدورك (❌):`;
            await msg.edit({ content: nextTitle, components: getBoardComponents() }).catch(()=>{});
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
            await i.deferUpdate().catch(()=>{});
            activeGames.delete(channel.id);
            const chosen = parseInt(i.customId.replace('box_', ''));
            if (chosen === winningBox) {
                let eco = await getEconomyUser(guildId, i.user.id);
                eco.balance += 10000;
                await saveEconomyUser(guildId, i.user.id, eco);
                addPoints(guildId, i.user.id, i.user.displayName, channel);
                await msg.edit({ content: `👑 **مبروك كسبت $10,000 كاش** و **10 نقاط**! 🎉`, components: [] }).catch(()=>{});
            } else {
                await msg.edit({ content: `💨 صندوق فاضي، هاردلك! 💀`, components: [] }).catch(()=>{});
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

  // --- أمر إرسال إعلان تحديث لعبة لروم معين ---
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

  // تفعيل نظام التلفيل (XP) في رومات الألعاب ورومات الاقتصاد جميعها
  if (allowedChannels.includes(message.channel.id) || allowedEconomyChannels.includes(message.channel.id)) {
      await trackUserMessage(guildId, userId, message.author.displayName, message.channel, message.member);
  }

  // أوامر الاقتصاد تعمل بسلاسة تامة في الروم المخصص أو المفتوح
  if (allowedEconomyChannels.includes(message.channel.id) || allowedChannels.includes(message.channel.id)) {
      if (message.content === '!اقتصاد') {
          const embed = new EmbedBuilder().setColor('#2ecc71').setTitle('🏦 النظام الاقتصادي والمزايا الفخمة').addFields(
              { name: '💵 الأساسيات', value: '`!راتب` | `!بنك`', inline: false },
              { name: '👤 الهوية', value: '`!هوية`', inline: false },
              { name: '👔 الوظائف', value: '`!وظائف` | `!وظيفة [الرمز]`', inline: false },
              { name: '📈 السوق', value: '`!سوق` | `!شراء [رقم]` | `!بيع [رقم]` | `!املاكي`', inline: false },
              { name: '🦹‍♂️ الجريمة والحظ', value: '`!سرقة [@شخص]` | `!حظ [المبلغ]` | `!صندوق`', inline: false },
              { name: '🎯 المهام', value: '`!مهامي` | `!تحويل [@شخص] [المبلغ]`', inline: false }
          );
          return message.channel.send({ embeds: [embed] });
      }
      
      if (message.content === '!بنك' || message.content === '!ابنك') {
          const user = await getEconomyUser(guildId, userId);
          return message.reply(`💳 رصيدك: **$${user.balance.toLocaleString()}** | وظيفتك: **${user.job}**`);
      }

      // نظام الرواتب (مدمج معه أرباح العقارات والأملاك) والتحقق من الـ Cooldown (5 دقائق)
      if (message.content === '!راتب' || message.content === 'راتب') {
          if (processingUsers.has(userId)) return;
          processingUsers.add(userId);

          try {
              let user = await getEconomyUser(guildId, userId);
              const now = Date.now();
              const cooldown = 5 * 60 * 1000; // 5 دقائق

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

              // حساب أرباح العقارات والأملاك ودمجها تلقائياً
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

      // نظام الهوية
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

      // نظام الوظائف (20 وظيفة)
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
          if (!jobKey || !jobsList[jobKey]) return message.reply('❌ يرجى إدخال رمز وظيفة صحيح! (مثال: `!وظيفة مهندس`)');
          const targetJob = jobsList[jobKey];
          let pUser = await getPointsUser(guildId, userId, message.author.displayName);
          if (pUser.level < targetJob.level) {
              return message.reply(`⛔ مستواك الحالي Level ${pUser.level} بينما وظيفة **${targetJob.name}** تتطلب Level ${targetJob.level}!`);
          }
          let user = await getEconomyUser(guildId, userId);
          user.job = targetJob.name;
          await saveEconomyUser(guildId, userId, user);
          return message.reply(`🎉 مبروك! تم ترقيتك رسمياً إلى وظيفة **${user.job}**! 🎖️`);
      }

      if (message.content === '!سوق') {
          const embed = new EmbedBuilder().setColor('#0099ff').setTitle('📈 بورصة العقارات والأعمال');
          marketItems.forEach(i => embed.addFields({ name: `[${i.id}] ${i.emoji} ${i.name}`, value: `💰 **$${i.price.toLocaleString()}** | 💸 ربح: **$${i.profit.toLocaleString()}**`, inline: true }));
          return message.channel.send({ embeds: [embed] });
      }

      if (message.content.startsWith('!شراء ')) {
          const id = parseInt(message.content.split(' ')[1]);
          const item = marketItems.find(i => i.id === id);
          if (!item) return message.reply('❌ رقم العقار خطأ!');
          let user = await getEconomyUser(guildId, userId);
          if (user.balance < item.price) return message.reply('💸 فلوسك ما تكفي لشراء هذا العقار!');
          user.balance -= item.price; user.properties.push(id);
          await saveEconomyUser(guildId, userId, user);
          return message.reply(`🎉 شريت **${item.name}** بـ **$${item.price.toLocaleString()}**!`);
      }

      if (message.content === '!املاكي') {
          const user = await getEconomyUser(guildId, userId);
          if (user.properties.length === 0) return message.reply('مفلس! ما عندك عقارات مسجلة.');
          const embed = new EmbedBuilder().setColor('#00FF00').setTitle(`🏠 محفظتك`);
          user.properties.forEach((pid, idx) => {
              const item = marketItems.find(i => i.id === pid);
              if (item) embed.addFields({ name: `${idx+1}. ${item.emoji} ${item.name}`, value: `القيمة الحالية: $${item.price.toLocaleString()} | أرباحه بالراتب: $${item.profit.toLocaleString()}`, inline: false });
          });
          return message.channel.send({ embeds: [embed] });
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

      // نظام السرقة الفعال والمضبوط
      if (message.content.startsWith('!سرقة')) {
          const target = message.mentions.users.first();
          if (!target) return message.reply('❌ الاستخدام الصحيح: `!سرقة [@الشخص]`');
          if (target.bot || target.id === userId) return message.reply('😅 ما تقدر تسرق بوت أو تسرق نفسك!');
          let user = await getEconomyUser(guildId, userId);
          const now = Date.now();
          const crimeCooldown = 10 * 60 * 1000; // 10 دقائق
          if (user.lastCrime && (now - user.lastCrime < crimeCooldown)) {
              const m = Math.ceil((crimeCooldown - (now - user.lastCrime)) / 60000);
              return message.reply(`🚓 الشرطة تراقبك! انتظر **${m} دقيقة** قبل محاولة السرقة التالية.`);
          }
          let targetUser = await getEconomyUser(guildId, target.id);
          if (targetUser.balance < 500) return message.reply('💸 الضحية مفلس، ما عنده فلوس تستاهل المخاطرة!');
          user.lastCrime = now;
          if (Math.random() < 0.45) {
              const stolen = Math.floor(targetUser.balance * 0.3) + 200;
              targetUser.balance -= stolen; user.balance += stolen;
              await saveEconomyUser(guildId, target.id, targetUser);
              await saveEconomyUser(guildId, userId, user);
              return message.channel.send(`🦹‍♂️ **عملية ناجحة!** سرق ${message.author} مبلغ **$${stolen.toLocaleString()}** من ${target}! 💰🔥`);
          } else {
              const fine = 300;
              user.balance = Math.max(0, user.balance - fine);
              await saveEconomyUser(guildId, userId, user);
              return message.channel.send(`🚨 **فشلت السرقة!** صادَت الشرطة ${message.author} وغرمته **$${fine}**! 🚔💀`);
          }
      }

      if (message.content.startsWith('!حظ')) {
          const amt = parseInt(message.content.split(' ')[1]);
          if (isNaN(amt) || amt <= 50) return message.reply('❌ أدخل مبلغ مراهنة صحيح (أقل مبلغ 50): `!حظ [المبلغ]`');
          let user = await getEconomyUser(guildId, userId);
          if (user.balance < amt) return message.reply('💸 رصيدك الكاش ما يكفي للمبلغ اللي تبيه!');
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
          if (user.lastQuest && (now - user.lastQuest < 24 * 60 * 60 * 1000)) return message.reply('⏳ أتممت مهام اليوم بالفعل! عُد غداً.');
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
          if (s.balance < amt) return message.reply('💸 رصيدك ما يكفي للمبلغ المراد تحويله!');
          s.balance -= amt; await saveEconomyUser(guildId, userId, s);
          let r = await getEconomyUser(guildId, target.id);
          r.balance += amt; await saveEconomyUser(guildId, target.id, r);
          return message.channel.send(`✅ تم تحويل **$${amt.toLocaleString()}** بنجاح إلى ${target}!`);
      }
  }

  // الألعاب والفعاليات
  if (allowedChannels.includes(message.channel.id) || allowedEconomyChannels.includes(message.channel.id)) {
      if (message.content === '!فعالية' || message.content === '!لعبة') {
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
          else if (r === 10) startRPSGame(message.channel, guildId);
          else if (r === 11) startPenaltyGame(message.channel, guildId);
          else if (r === 12) startMinesGame(message.channel, guildId, userId);
          else if (r === 13) startRaceGame(message.channel, guildId, userId);
          else if (r === 14) startVaultGame(message.channel, guildId, userId);
          else startBoxesGame(message.channel, guildId, userId);
          return;
      }

      if (message.content === '!العاب') return sendGamesMenu(message.channel);

      const text = message.content.toLowerCase();
      if (text.startsWith('!حجر') || text.startsWith('حجر')) return startRPSGame(message, guildId);
      if (text.startsWith('!xo') || text.startsWith('xo')) return startXOGame(message, guildId);
      if (text.startsWith('!ذاكرة') || text.startsWith('ذاكرة') || text.startsWith('إذاكرة')) return startMemoryGame(message, guildId);
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
