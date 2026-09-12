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
            { name: '🧠 لعبة الذاكرة (الأوراق المقلوبة)', value: '`!ذاكرة [سهل/متوسط/صعب] [@شخص]` (تحدي فردي أو ثنائي بالمستويات)', inline: false },
            { name: '📦 الألعاب التفاعلية', value: '`!صناديق` (تخمين الصندوق السري الأسطوري)', inline: false },
            { name: '🎲 الفعاليات العشوائية', value: '`!فعالية` (يختار لعبة عشوائية من القائمة)', inline: false },
            { name: '🏆 لوحة الصدارة التفاعلية', value: '`!ت` (لعرض لوحة الشرف بالأزرار)', inline: false }
        )
        .setFooter({ text: '🛑 لإلغاء أي لعبة جارية اكتب: !ايقاف' });
    channel.send({ embeds: [embed] });
}

// --- لعبة الذاكرة المتطورة (بالمستويات والتحدي الفردي أو الثنائي) ---
function startMemoryGame(message, guildId) {
    const channel = message.channel;
    const args = message.content.split(' ');
    let difficulty = 'سهل';
    
    // تحديد مستوى الدقة بناءً على الكلمة المدخلة
    const contentLower = message.content.toLowerCase();
    if (contentLower.includes('متوسط')) difficulty = 'متوسط';
    else if (contentLower.includes('صعب')) difficulty = 'صعب';

    const opponent = message.mentions.users.first();
    const challenger = message.author;

    if (opponent && (opponent.bot || opponent.id === challenger.id)) {
        return message.reply('❌ لا يمكنك تحدي بوت أو تحدي نفسك في لعبة الذاكرة!');
    }

    let size = 3; // سهل 3x3
    let pairsCount = 4;
    if (difficulty === 'متوسط') { size = 4; pairsCount = 8; }
    else if (difficulty === 'صعب') { size = 6; pairsCount = 18; }

    const availableEmojis = ['🍎', '🍌', '🍇', '⭐', '💎', '🔥', '🚀', '🍕', '⚽', '🎸', '🎮', '💡', '👑', '🍀', '🎯', '⚡', '🧸', '🎨'];
    let selectedEmojis = availableEmojis.slice(0, pairsCount);
    let deck = [...selectedEmojis, ...selectedEmojis];
    if (size === 3) deck = deck.slice(0, 8); // 3x3 = 9 cells

    deck = deck.sort(() => Math.random() - 0.5);

    let revealed = Array(deck.length).fill(false);
    let matched = Array(deck.length).fill(false);
    let firstSelection = null;
    let currentPlayer = challenger.id;
    let scores = { [challenger.id]: 0, ...(opponent ? { [opponent.id]: 0 } : {}) };

    const getBoardComponents = (isEnded = false) => {
        const rows = [];
        for (let r = 0; r < size; r++) {
            const rowComps = [];
            for (let c = 0; c < size; c++) {
                const idx = r * size + c;
                if (idx >= deck.length) break;

                let label = '❓';
                let style = ButtonStyle.Secondary;
                let disabled = isEnded || matched[idx];

                if (revealed[idx] || matched[idx]) {
                    label = deck[idx];
                    style = matched[idx] ? ButtonStyle.Success : ButtonStyle.Primary;
                }

                rowComps.push(
                    new ButtonBuilder()
                        .setCustomId(`mem_${idx}`)
                        .setLabel(label)
                        .setStyle(style)
                        .setDisabled(disabled)
                );
            }
            rows.push(new ActionRowBuilder().addComponents(rowComps));
        }
        return rows;
    };

    const modeTitle = opponent ? `🧠 **[لعبة الذاكرة الثنائية - مستوى ${difficulty}]**\nالتحدي بين ${challenger} و ${opponent}` : `🧠 **[لعبة الذاكرة الفردية - مستوى ${difficulty}]**\nاللاعب: ${challenger}`;

    channel.send({ content: `${modeTitle}\nالدور الحالي: <@${currentPlayer}>\nطابق الأوراق المقلوبة قبل انتهاء الوقت!`, components: getBoardComponents() }).then(msg => {
        const coll = msg.createMessageComponentCollector({ time: 45000 });

        coll.on('collect', async i => {
            const p1 = challenger.id;
            const p2 = opponent ? opponent.id : null;

            if (i.user.id !== currentPlayer && i.user.id !== p1 && i.user.id !== p2) {
                return i.reply({ content: '❌ هذه اللعبة ليست لك!', ephemeral: true });
            }
            if (i.user.id !== currentPlayer) {
                return i.reply({ content: '⏳ ليس دورك الآن!', ephemeral: true });
            }

            const idx = parseInt(i.customId.replace('mem_', ''));
            if (revealed[idx] || matched[idx]) return i.reply({ content: '⚠️ هذه الورقة مكشوفة مسبقاً!', ephemeral: true });

            revealed[idx] = true;

            if (firstSelection === null) {
                firstSelection = idx;
                await i.update({ content: `${modeTitle}\nالدور الحالي: <@${currentPlayer}>`, components: getBoardComponents() });
            } else {
                const firstIdx = firstSelection;
                firstSelection = null;

                if (deck[firstIdx] === deck[idx]) {
                    matched[firstIdx] = true;
                    matched[idx] = true;
                    scores[currentPlayer] += 1;

                    if (matched.every((m, index) => m || index >= deck.length)) {
                        coll.stop();
                        let winText = '';
                        if (opponent) {
                            const s1 = scores[p1]; const s2 = scores[p2];
                            winText = s1 > s2 ? `🎉 **الفائز هو ${challenger}** برصيد نقاط أعلى وكسب **10 نقاط**! 🌟` : (s2 > s1 ? `🎉 **الفائز هو ${opponent}** برصيد نقاط أعلى وكسب **10 نقاط**! 🌟` : `🤝 **تعادل تام بين الاثنين!**`);
                            if (s1 > s2) addPoints(guildId, p1, challenger.displayName, channel);
                            else if (s2 > s1) addPoints(guildId, p2, opponent.displayName, channel);
                        } else {
                            winText = `🎉 **كفو يا أسطورة ${challenger}!** أنهيت اللعبة بنجاح وكسبت **10 نقاط**! 🌟`;
                            addPoints(guildId, challenger.id, challenger.displayName, channel);
                        }
                        return i.update({ content: `${modeTitle}\n\n🏆 **انتهت اللعبة!**\n${winText}`, components: getBoardComponents(true) });
                    }

                    await i.update({ content: `${modeTitle}\n✨ تطابق صحيح! لك دور إضافي يا <@${currentPlayer}>`, components: getBoardComponents() });
                } else {
                    await i.update({ content: `${modeTitle}\n❌ خطأ! ليست متطابقة.`, components: getBoardComponents() });
                    setTimeout(async () => {
                        revealed[firstIdx] = false;
                        revealed[idx] = false;
                        if (opponent) currentPlayer = currentPlayer === p1 ? p2 : p1;
                        await msg.edit({ content: `${modeTitle}\nالدور الحالي: <@${currentPlayer}>`, components: getBoardComponents() }).catch(()=>{});
                    }, 1500);
                }
            }
        });

        coll.on('end', (_, r) => {
            if (r === 'time') {
                msg.edit({ content: `⏰ انتهى الوقت المخصص للعبة الذاكرة!`, components: [] }).catch(()=>{});
            }
        });
    });
}

// --- لعبة حجر ورقة مقص (ضد البوت أو ضد شخص بالمنشن مع بوت ذكي) ---
function startRPSGame(message, guildId) {
    const channel = message.channel;
    const opponent = message.mentions.users.first();
    const challenger = message.author;

    if (opponent && (opponent.bot || opponent.id === challenger.id)) {
        return message.reply('❌ لا يمكنك تحدي بوت أو تحدي نفسك!');
    }

    if (opponent) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('rps_rock').setLabel('🪨 حجر').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('rps_paper').setLabel('📄 ورقة').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('rps_scissors').setLabel('✂️ مقص').setStyle(ButtonStyle.Danger)
        );

        channel.send({ content: `⚔️ **[تحدي حجر ورقة مقص الثنائي]**\nالتحدي بين ${challenger} و ${opponent}!\nالكل يضغط اختياره سراً بالأسفل (معكم 20 ثانية):`, components: [row] }).then(msg => {
            const choices = new Map();
            const coll = msg.createMessageComponentCollector({ time: 20000 });

            coll.on('collect', async i => {
                if (i.user.id !== challenger.id && i.user.id !== opponent.id) {
                    return i.reply({ content: '❌ هذه اللعبة ليست لك!', ephemeral: true });
                }
                if (choices.has(i.user.id)) {
                    return i.reply({ content: '⚠️ لقد اخترت مسبقاً!', ephemeral: true });
                }

                const choice = i.customId.replace('rps_', '');
                choices.set(i.user.id, choice);
                await i.reply({ content: `✅ تم تسجيل اختيارك بنجاح!`, ephemeral: true });

                if (choices.size === 2) {
                    coll.stop();
                    const c1 = choices.get(challenger.id);
                    const c2 = choices.get(opponent.id);
                    const emojis = { rock: '🪨 حجر', paper: '📄 ورقة', scissors: '✂️ مقص' };

                    let winnerText = '';
                    if (c1 === c2) {
                        winnerText = `🤝 **تعادل بين الاثنين!** كلكما اخترتم (${emojis[c1]})`;
                    } else if (
                        (c1 === 'rock' && c2 === 'scissors') ||
                        (c1 === 'paper' && c2 === 'rock') ||
                        (c1 === 'scissors' && c2 === 'paper')
                    ) {
                        winnerText = `🎉 **الفائز هو ${challenger}!**\nاختاره (${emojis[c1]}) ضد (${emojis[c2]}) لـ ${opponent}. وكسب **10 نقاط**! 🌟`;
                        addPoints(guildId, challenger.id, challenger.displayName, channel);
                    } else {
                        winnerText = `🎉 **الفائز هو ${opponent}!**\nاختاره (${emojis[c2]}) ضد (${emojis[c1]}) لـ ${challenger}. وكسب **10 نقاط**! 🌟`;
                        addPoints(guildId, opponent.id, opponent.displayName, channel);
                    }
                    msg.edit({ content: `🎮 **نتيجة التحدي:**\n${winnerText}`, components: [] }).catch(()=>{});
                }
            });

            coll.on('end', (_, r) => {
                if (r === 'time' && choices.size < 2) {
                    msg.edit({ content: `⏰ انتهى الوقت ولم يكتمل اللاعبان!`, components: [] }).catch(()=>{});
                }
            });
        });

    } else {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('rps_rock').setLabel('🪨 حجر').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('rps_paper').setLabel('📄 ورقة').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('rps_scissors').setLabel('✂️ مقص').setStyle(ButtonStyle.Danger)
        );

        channel.send({ content: `🤖 **[تحدي حجر ورقة مقص ضد البوت الذكي]**\nاختر حركتك (معك 15 ثانية):`, components: [row] }).then(msg => {
            const coll = msg.createMessageComponentCollector({ time: 15000, max: 1 });

            coll.on('collect', async i => {
                if (i.user.id !== challenger.id) return i.reply({ content: '❌ هذه اللعبة ليست لك!', ephemeral: true });

                const userChoice = i.customId.replace('rps_', '');
                const smartMoves = { rock: 'paper', paper: 'scissors', scissors: 'rock' };
                const randomChoice = ['rock', 'paper', 'scissors'][Math.floor(Math.random() * 3)];
                const botChoice = Math.random() < 0.6 ? smartMoves[userChoice] : randomChoice;

                const emojis = { rock: '🪨 حجر', paper: '📄 ورقة', scissors: '✂️ مقص' };
                let resultMsg = '';

                if (userChoice === botChoice) {
                    resultMsg = `🤝 **تعادل ذكي!** البوت اختار (${emojis[botChoice]}) مثلك تماماً!`;
                } else if (
                    (userChoice === 'rock' && botChoice === 'scissors') ||
                    (userChoice === 'paper' && botChoice === 'rock') ||
                    (userChoice === 'scissors' && botChoice === 'paper')
                ) {
                    resultMsg = `🎉 **كفو يا بطل! هزمت البوت الذكي!**\nأنت (${emojis[userChoice]}) والبوت (${emojis[botChoice]}). كسبت **10 نقاط**! 🌟`;
                    addPoints(guildId, challenger.id, challenger.displayName, channel);
                } else {
                    resultMsg = `🧠 **هزمك البوت الذكي!**\nأنت (${emojis[userChoice]}) والبوت (${emojis[botChoice]}). هاردلك! 💀`;
                }

                await i.update({ content: resultMsg, components: [] });
            });

            coll.on('end', (_, r) => {
                if (r === 'time') {
                    msg.edit({ content: `⏰ انتهى الوقت ولم تقم بالاختيار!`, components: [] }).catch(()=>{});
                }
            });
        });
    }
}

// --- لعبة XO (إكس أو الذكية ضد شخص أو ضد البوت) ---
function startXOGame(message, guildId) {
    const channel = message.channel;
    const opponent = message.mentions.users.first();
    const challenger = message.author;

    if (opponent && (opponent.bot || opponent.id === challenger.id)) {
        return message.reply('❌ لا يمكنك تحدي بوت أو تحدي نفسك في XO!');
    }

    const isAgainstBot = !opponent;
    let board = Array(9).fill(null);
    let currentPlayer = challenger.id;

    const getBoardComponents = (isEnded = false) => {
        const rows = [];
        for (let r = 0; r < 3; r++) {
            const rowComps = [];
            for (let c = 0; c < 3; c++) {
                const idx = r * 3 + c;
                let label = '—';
                let style = ButtonStyle.Secondary;

                if (board[idx] === 'X') { label = '❌'; style = ButtonStyle.Danger; }
                else if (board[idx] === 'O') { label = '⭕'; style = ButtonStyle.Primary; }

                rowComps.push(
                    new ButtonBuilder()
                        .setCustomId(`xo_${idx}`)
                        .setLabel(label)
                        .setStyle(style)
                        .setDisabled(isEnded || board[idx] !== null)
                );
            }
            rows.push(new ActionRowBuilder().addComponents(rowComps));
        }
        return rows;
    };

    const checkWin = (b) => {
        const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
        for (let w of wins) {
            if (b[w[0]] && b[w[0]] === b[w[1]] && b[w[0]] === b[w[2]]) return b[w[0]];
        }
        if (b.every(cell => cell !== null)) return 'tie';
        return null;
    };

    const getBotMove = (b) => {
        const emptyIndices = b.map((val, idx) => val === null ? idx : null).filter(val => val !== null);
        for (let idx of emptyIndices) {
            let temp = [...b]; temp[idx] = 'O';
            if (checkWin(temp) === 'O') return idx;
        }
        for (let idx of emptyIndices) {
            let temp = [...b]; temp[idx] = 'X';
            if (checkWin(temp) === 'X') return idx;
        }
        if (b[4] === null) return 4;
        return emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
    };

    const gameTitle = isAgainstBot ? `🎮 **[تحدي XO ضد البوت الذكي]**` : `🎮 **[تحدي XO الثنائي]** بين ${challenger} و ${opponent}`;
    
    channel.send({ content: `${gameTitle}\nدور اللاعب: <@${currentPlayer}> (❌)`, components: getBoardComponents() }).then(msg => {
        const coll = msg.createMessageComponentCollector({ time: 60000 });

        coll.on('collect', async i => {
            const player1Id = challenger.id;
            const player2Id = isAgainstBot ? client.user.id : opponent.id;

            if (i.user.id !== currentPlayer && i.user.id !== player1Id && i.user.id !== player2Id) {
                return i.reply({ content: '❌ هذه اللعبة ليست لك!', ephemeral: true });
            }
            if (i.user.id !== currentPlayer) {
                return i.reply({ content: '⏳ ليس دورك الآن!', ephemeral: true });
            }

            const idx = parseInt(i.customId.replace('xo_', ''));
            if (board[idx] !== null) return i.reply({ content: '⚠️ هذا المربع محجوز!', ephemeral: true });

            const symbol = currentPlayer === player1Id ? 'X' : 'O';
            board[idx] = symbol;

            let winner = checkWin(board);

            if (winner) {
                coll.stop();
                let resultText = '';
                if (winner === 'tie') resultText = `🤝 **تعادل في لعبة XO!**`;
                else if (winner === 'X') {
                    resultText = `🎉 **كفو ${challenger}! فزت في تحدي XO** وكسبت **10 نقاط**! 🌟`;
                    addPoints(guildId, challenger.id, challenger.displayName, channel);
                } else {
                    resultText = isAgainstBot ? `🤖 **هزمك البوت الذكي في XO!** هاردلك 💀` : `🎉 **كفو ${opponent}! فزت في تحدي XO** وكسبت **10 نقاط**! 🌟`;
                    if (!isAgainstBot) addPoints(guildId, opponent.id, opponent.displayName, channel);
                }
                return i.update({ content: `${gameTitle}\n\n${resultText}`, components: getBoardComponents(true) });
            }

            currentPlayer = currentPlayer === player1Id ? (isAgainstBot ? client.user.id : opponent.id) : player1Id;

            if (isAgainstBot && currentPlayer === client.user.id) {
                const botIdx = getBotMove(board);
                if (botIdx !== undefined) {
                    board[botIdx] = 'O';
                    winner = checkWin(board);
                    if (winner) {
                        coll.stop();
                        let resultText = winner === 'tie' ? `🤝 تعادل!` : `🤖 **هزمك البوت الذكي في XO!** هاردلك 💀`;
                        return i.update({ content: `${gameTitle}\n\n${resultText}`, components: getBoardComponents(true) });
                    }
                    currentPlayer = player1Id;
                }
            }

            const nextSymbol = currentPlayer === player1Id ? '❌' : '⭕';
            await i.update({ content: `${gameTitle}\nدور اللاعب: <@${currentPlayer}> (${nextSymbol})`, components: getBoardComponents() });
        });

        coll.on('end', (_, r) => {
            if (r === 'time') {
                msg.edit({ content: `⏰ انتهى وقت لعبة XO!`, components: [] }).catch(()=>{});
            }
        });
    });
}

// --- لعبة تخمين الصندوق السري (شبكة 3x3) ---
function startBoxesGame(channel, guildId, userId) {
    if (activeGames.has(channel.id)) return;
    activeGames.set(channel.id, 'boxes');

    const winningBox = Math.floor(Math.random() * 9);
    const rows = [];

    for (let r = 0; r < 3; r++) {
        const rowComps = [];
        for (let c = 0; c < 3; c++) {
            const idx = r * 3 + c;
            rowComps.push(
                new ButtonBuilder()
                    .setCustomId(`box_${idx}_${idx === winningBox ? 'win' : 'empty'}`)
                    .setLabel(`صندوق ${idx + 1}`)
                    .setStyle(ButtonStyle.Primary)
            );
        }
        rows.push(new ActionRowBuilder().addComponents(rowComps));
    }

    channel.send({ content: `📦 **[تخمين الصندوق السري الفخم]**\nأمامك 9 صناديق مغلقة، واحد منها فقط يحتوي على الجائزة الكبرى! اختر صندوقاً:`, components: rows }).then(msg => {
        const coll = msg.createMessageComponentCollector({ time: 20000 });

        coll.on('collect', async i => {
            if (i.user.id !== userId && !allowedEconomyChannels.includes(i.channel.id)) {
                return i.reply({ content: '❌ هذه اللعبة ليست لك!', ephemeral: true });
            }

            const isWin = i.customId.includes('win');
            const clickedIdx = parseInt(i.customId.split('_')[1]);

            const updatedRows = [];
            for (let r = 0; r < 3; r++) {
                const rowComps = [];
                for (let c = 0; c < 3; c++) {
                    const idx = r * 3 + c;
                    const btn = new ButtonBuilder().setCustomId(`d_${idx}`).setLabel(idx === winningBox ? '💎 الكنز' : (idx === clickedIdx ? '💨 فاضي' : '•')).setStyle(idx === winningBox ? ButtonStyle.Success : (idx === clickedIdx ? ButtonStyle.Danger : ButtonStyle.Secondary)).setDisabled(true);
                    rowComps.push(btn);
                }
                updatedRows.push(new ActionRowBuilder().addComponents(rowComps));
            }

            activeGames.delete(channel.id);
            coll.stop();

            if (isWin) {
                await i.update({ content: `👑 **مبروك يا أسطورة ${i.user}!** فتحت الصندوق الصحيح وكسبت جائزة كبرى بقيمة **$10,000 كاش** و **10 نقاط**! 🎉🔥`, components: updatedRows });
                let eco = await getEconomyUser(guildId, i.user.id);
                eco.balance += 10000;
                await saveEconomyUser(guildId, i.user.id, eco);
                addPoints(guildId, i.user.id, i.user.displayName, channel);
            } else {
                await i.update({ content: `💨 **حظاً أوفر يا ${i.user}!** اخترت صندوق فاضي، راح عليك الكنز! 💀`, components: updatedRows });
            }
        });

        coll.on('end', (_, r) => {
            if (r === 'time') {
                activeGames.delete(channel.id);
                msg.edit({ content: `⏰ انتهى الوقت ولم تختار أي صندوق!`, components: [] }).catch(()=>{});
            }
        });
    });
}

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  const guildId = message.guild.id;
  const userId = message.author.id;

  lastActivityTime.set(message.channel.id, Date.now());

  // --- أمر مسح رسائل الروم (خاص بالأدمن أو إدارة الرسائل فقط) ---
  if (message.content.startsWith('!مسح') || message.content.startsWith('!حذف')) {
      if (!message.member.permissions.has('ManageMessages')) {
          return message.reply('❌ عذراً، هذا الأمر مخصص لإدارة السيرفر فقط!');
      }

      const args = message.content.split(' ');
      const count = parseInt(args[1]);

      if (isNaN(count) || count <= 0 || count > 100) {
          return message.reply('❌ يرجى تحديد عدد صحيح للمسح بين 1 و 100 (مثال: `!مسح 50`)');
      }

      try {
          await message.delete().catch(() => {});
          const fetched = await message.channel.messages.fetch({ limit: count });
          const deleted = await message.channel.bulkDelete(fetched, true);

          const confirmMsg = await message.channel.send(`🧹 تم حذف **${deleted.size}** رسالة بنجاح بواسطة ${message.author}!`);
          setTimeout(() => confirmMsg.delete().catch(() => {}), 4000);
      } catch (err) {
          console.error('Error clearing messages:', err);
          return message.channel.send('❌ حدث خطأ أثناء محاولة مسح الرسائل (تأكد أن الرسائل أقدم من 14 يوماً).');
      }
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
              .setFooter({ text: '💡 تفاعل بالألعاب والرسائل لرفع مستواك وجمع الثروة!' })
              .setTimestamp();

          return message.channel.send({ embeds: [profileEmbed] });
      }
      
      if (message.content === '!وظائف') {
          const embed = new EmbedBuilder()
              .setColor('#3498DB')
              .setTitle('👔 سلّم الوظائف في السيرفر (20 وظيفة)')
              .setDescription('كل ما ارتفع مستواك (`Level`) في السيرفر، فتحت لك وظائف برواتب أعلى!\nلتقديم الطلب اكتب: `!وظيفة [رمز الوظيفة]`');
          
          let desc = '';
          for (let key in jobsList) {
              const j = jobsList[key];
              desc += `• **${j.name}** | الراتب: \`$${j.salary.toLocaleString()}\` | الشرط: \`Level ${j.level}\` (الرمز: \`${key}\`)\n`;
          }
          embed.setDescription(desc);
          return message.channel.send({ embeds: [embed] });
      }

      if (message.content.startsWith('!وظيفة')) {
          const args = message.content.split(' ');
          const jobKey = args[1];
          if (!jobKey || !jobsList[jobKey]) {
              return message.reply('❌ يرجى إدخال رمز وظيفة صحيح من القائمة! استخدم أمر: `!وظائف`');
          }

          const targetJob = jobsList[jobKey];
          let pUser = await getPointsUser(guildId, userId, message.author.displayName);

          if (pUser.level < targetJob.level) {
              return message.reply(`⛔ عذراً! مستواك الحالي هو \`Level ${pUser.level}\` بينما وظيفة **${targetJob.name}** تتطلب وصولك إلى **Level ${targetJob.level}** على الأقل! تفاعل بالألعاب والرسائل لرفع مستواك.`);
          }

          let user = await getEconomyUser(guildId, userId);
          
          try {
              const member = await message.guild.members.fetch(userId);
              for (let key in jobsList) {
                  const oldJobName = jobsList[key].name;
                  const oldRole = message.guild.roles.cache.find(r => r.name === oldJobName);
                  if (oldRole && member.roles.cache.has(oldRole.id)) {
                      await member.roles.remove(oldRole).catch(() => {});
                  }
              }
              const newRole = message.guild.roles.cache.find(r => r.name === targetJob.name);
              if (newRole) {
                  await member.roles.add(newRole).catch(() => {});
              }
          } catch (e) {
              console.error('Error managing job roles:', e);
          }

          user.job = targetJob.name;
          await saveEconomyUser(guildId, userId, user);
          return message.reply(`🎉 مبروك يا بطل! تم قبولك وترقيتك رسمياً في وظيفة **${user.job}** وتم منحك الرتبة في السيرفر! 🎖️`);
      }

      if (message.content === '!راتب') {
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

              user.balance += baseSalary; 
              user.lastWork = now;
              
              await saveEconomyUser(guildId, userId, user);
              processingUsers.delete(userId);
              
              const salaryEmbed = new EmbedBuilder()
                  .setColor('#2ECC71')
                  .setTitle('💵 صرف الراتب')
                  .setDescription(`👤 <@${userId}>\nتم إيداع راتبك (${user.job}) بقيمة **$${baseSalary.toLocaleString()}** في رصيدك بالسيرفر!`);
              message.channel.send({ embeds: [salaryEmbed] });
              return;
          } catch (err) {
              processingUsers.delete(userId);
              console.error(err);
          }
      }

      if (message.content === '!سوق') {
          const embed = new EmbedBuilder().setColor('#0099ff').setTitle('📈 بورصة العقارات والأعمال');
          marketItems.forEach(i => {
              embed.addFields({ name: `[${i.id}] ${i.emoji} ${i.name}`, value: `🏷️ \`${i.type}\`\n💰 **$${i.price.toLocaleString()}** | 💸 ربح: **$${i.profit.toLocaleString()}**`, inline: true });
          });
          embed.setFooter({ text: '💡 لشراء عقار: !شراء [رقم] | 🏷️ رسوم بيع العقار: استرداد 90% من قيمته الحالية' });
          return message.channel.send({ embeds: [embed] });
      }
      if (message.content.startsWith('!شراء ')) {
          const id = parseInt(message.content.split(' ')[1]);
          const item = marketItems.find(i => i.id === id);
          if (!item) return message.reply('❌ رقم العقار خطأ!');
          let user = await getEconomyUser(guildId, userId);
          if (user.balance < item.price) return message.reply('💸 فلوسك ما تكفي!');
          user.balance -= item.price; 
          user.properties.push(id);
          await saveEconomyUser(guildId, userId, user);
          return message.reply(`🎉 شريت **${item.name}** بـ **$${item.price.toLocaleString()}**! رصيدك: **$${user.balance.toLocaleString()}**`);
      }
      if (message.content === '!املاكي') {
          const user = await getEconomyUser(guildId, userId);
          if (user.properties.length === 0) return message.reply('مفلس! ما عندك عقارات بهذا السيرفر.');
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
          
          if (isNaN(indexToSell) || indexToSell < 0 || indexToSell >= user.properties.length) {
              return message.reply('❌ رقم العقار في محفظتك غير صحيح! تأكد باستخدام أمر `!املاكي`');
          }

          const propId = user.properties[indexToSell];
          const item = marketItems.find(i => i.id === propId);
          
          if (!item) return message.reply('❌ حدث خطأ في بيانات العقار!');

          const sellPrice = Math.floor(item.price * 0.90);
          user.properties.splice(indexToSell, 1); 
          user.balance += sellPrice;
          await saveEconomyUser(guildId, userId, user);

          const sellEmbed = new EmbedBuilder()
              .setColor('#E74C3C')
              .setTitle('🤝 تمت عملية بيع العقار بنجاح')
              .setDescription(`👤 <@${userId}>\nتم بيع العقار **${item.emoji} ${item.name}** مقابل **$${sellPrice.toLocaleString()}** (بعد خصم 10% رسوم بيع من القيمة الحالية).`)
              .addFields(
                  { name: '💳 رصيدك الكاش الجديد', value: `\`$${user.balance.toLocaleString()}\``, inline: false }
              )
              .setTimestamp();

          return message.channel.send({ embeds: [sellEmbed] });
      }

      if (message.content === '!ارباح') {
          let user = await getEconomyUser(guildId, userId);
          if (user.properties.length === 0) return message.reply('❌ ما عندك عقارات.');
          const now = Date.now();
          if (now - user.lastProfit < 5 * 60 * 1000) {
              const m = Math.ceil((5 * 60 * 1000 - (now - user.lastProfit)) / 60000);
              return message.reply(`⏳ باقي **${m} دقيقة** على الأرباح!`);
          }
          let total = 0; 
          user.properties.forEach(pid => { const i = marketItems.find(x => x.id === pid); if (i) total += i.profit; });
          user.balance += total; 
          user.lastProfit = now;
          await saveEconomyUser(guildId, userId, user);
          
          const profitEmbed = new EmbedBuilder()
              .setColor('#3498DB')
              .setTitle('📈 صرف أرباح العقارات والأملاك')
              .setDescription(`👤 <@${userId}>\nتم استلام أرباح أملاكك بقيمة **$${total.toLocaleString()}** وتحويلها إلى رصيدك!`);
          message.channel.send({ embeds: [profitEmbed] });
          return;
      }

      if (message.content.startsWith('!سرقة')) {
          const target = message.mentions.users.first();
          if (!target) return message.reply('❌ الاستخدام الصحيح: `!سرقة [@الشخص]`');
          if (target.bot || target.id === userId) return message.reply('😅 ما تقدر تسرق بوت أو تسرق نفسك!');

          let user = await getEconomyUser(guildId, userId);
          const now = Date.now();
          const cooldown = 10 * 60 * 1000;
          if (user.lastCrime && (now - user.lastCrime < cooldown)) {
              const m = Math.ceil((cooldown - (now - user.lastCrime)) / 60000);
              return message.reply(`🚓 الشرطة تراقبك! انتظر **${m} دقيقة** قبل أن تحاول السرقة مجدداً.`);
          }

          let targetUser = await getEconomyUser(guildId, target.id);
          if (targetUser.balance < 500) return message.reply('💸 الضحية مفلس تماماً، ما عنده فلوس تستاهل المخاطرة!');

          user.lastCrime = now;
          const success = Math.random() < 0.45;

          if (success) {
              const stolenAmt = Math.floor(Math.random() * (targetUser.balance * 0.3)) + 200;
              targetUser.balance -= stolenAmt;
              user.balance += stolenAmt;
              await saveEconomyUser(guildId, target.id, targetUser);
              await saveEconomyUser(guildId, userId, user);
              return message.channel.send(`🦹‍♂️ **عملية ناجحة!** تمكن ${message.author} من سرقة **$${stolenAmt.toLocaleString()}** من المبيوق ${target} بخفاء تام! 💰🔥`);
          } else {
              const fine = Math.floor(Math.random() * 400) + 300;
              user.balance = Math.max(0, user.balance - fine);
              await saveEconomyUser(guildId, userId, user);
              return message.channel.send(`🚨 **فشلت العملية!** صادَت الشرطة ${message.author} أثناء محاولة السرقة وغرمته مبلغ **$${fine.toLocaleString()}**! 🚔💀`);
          }
      }

      if (message.content.startsWith('!حظ')) {
          const args = message.content.split(' ');
          const amt = parseInt(args[1]);
          if (isNaN(amt) || amt <= 50) return message.reply('❌ يرجى إدخال مبلغ صحيح للمراهنة (أقل مبلغ 50): `!حظ [المبلغ]`');

          let user = await getEconomyUser(guildId, userId);
          if (user.balance < amt) return message.reply('💸 رصيدك الكاش ما يكفي للمبلغ اللي تبيه!');

          const roll = Math.random();
          if (roll < 0.40) {
              user.balance -= amt;
              await saveEconomyUser(guildId, userId, user);
              return message.reply(`😢 للأسف خسرت رهنتك وراحت عليك **$${amt.toLocaleString()}**! رصيدك: **$${user.balance.toLocaleString()}**`);
          } else if (roll < 0.85) {
              user.balance += amt;
              await saveEconomyUser(guildId, userId, user);
              return message.reply(`🎰 **كفووو!** فزت وضاعفت فلوسك وكسبت **$${amt.toLocaleString()}**! رصيدك: **$${user.balance.toLocaleString()}** 🎉`);
          } else {
              const megaWin = amt * 3;
              user.balance += megaWin;
              await saveEconomyUser(guildId, userId, user);
              return message.channel.send(`👑 **ضربت الحظ الكبرى يا بطل!** كسبت أضعاف مضاعفة بقيمة **$${megaWin.toLocaleString()}** يا ${message.author}! 🔥🚀`);
          }
      }

      if (message.content === '!صندوق') {
          let user = await getEconomyUser(guildId, userId);
          const boxPrice = 3000;
          if (user.balance < boxPrice) return message.reply(`📦 سعر الصندوق السري **$${boxPrice.toLocaleString()}** ورصيدك ما يكفي!`);

          user.balance -= boxPrice;
          const prizes = [
              { type: 'cash', val: 1500, msg: '📦 فتحت الصندوق وطلع فيه مبلغ تعويض **$1,500**.' },
              { type: 'cash', val: 5000, msg: '🎉 وااو! فتحت الصندوق وطلع فيه كنز نقدي بقيمة **$5,000**!' },
              { type: 'cash', val: 12000, msg: '💎 يا ساتر! صندوق أسطوري يحتوي على كاش فخم بقيمة **$12,000**!' },
              { type: 'empty', val: 0, msg: '💨 للأسف فتحت الصندوق وطلع فاضي، راحت عليك الفلوس!' }
          ];

          const won = prizes[Math.floor(Math.random() * prizes.length)];
          if (won.val > 0) user.balance += won.val;
          await saveEconomyUser(guildId, userId, user);

          const boxEmbed = new EmbedBuilder()
              .setColor('#E67E22')
              .setTitle('📦 فتح الصندوق السري الغامض')
              .setDescription(`👤 ${message.author}\n${won.msg}\n\n💳 رصيدك الحالي: **$${user.balance.toLocaleString()}**`);
          return message.channel.send({ embeds: [boxEmbed] });
      }

      if (message.content === '!مهامي') {
          let user = await getEconomyUser(guildId, userId);
          const now = Date.now();
          const oneDay = 24 * 60 * 60 * 1000;

          if (user.lastQuest && (now - user.lastQuest < oneDay)) {
              return message.reply('⏳ لقد أتممت مهامك اليومية بالفعل! عُد غداً لمهام وجوائز جديدة.');
          }

          user.lastQuest = now;
          user.questsCompleted += 1;
          const questReward = 5000;
          user.balance += questReward;
          await saveEconomyUser(guildId, userId, user);

          const questEmbed = new EmbedBuilder()
              .setColor('#2ECC71')
              .setTitle('🎯 إنجاز المهام اليومية')
              .setDescription(`✅ ممتاز يا ${message.author}!\nأتممت مهام اليوم بنجاح وحصلت على مكافأة إنجاز بقيمة **$${questReward.toLocaleString()}**!\n\n📈 رصيدك الكاش الحالي: **$${user.balance.toLocaleString()}**`);
          return message.channel.send({ embeds: [questEmbed] });
      }

      if (message.content.startsWith('!تحويل')) {
          const args = message.content.split(' ');
          const target = message.mentions.users.first();
          const amt = parseInt(args[2]);
          if (!target || isNaN(amt) || amt <= 0) return message.reply('❌ الاستخدام: `!تحويل @الشخص المبلغ`');
          if (target.id === userId) return message.reply('😅 ما تحول لنفسك!');
          let s = await getEconomyUser(guildId, userId);
          if (s.balance < amt) return message.reply('💸 رصيدك ما يكفي!');
          s.balance -= amt; 
          await saveEconomyUser(guildId, userId, s);
          let r = await getEconomyUser(guildId, target.id);
          r.balance += amt; 
          await saveEconomyUser(guildId, target.id, r);
          return message.channel.send(`✅ تم تحويل **$${amt.toLocaleString()}** إلى ${target}.`);
      }
  }

  if (allowedChannels.includes(message.channel.id) || allowedEconomyChannels.includes(message.channel.id)) {
      if (allowedChannels.includes(message.channel.id)) {
          trackUserMessage(guildId, userId, message.author.displayName, message.channel, message.member);
      }

      // تشغيل الألعاب التفاعلية والأوامر الجديدة (تدعم الأمر سواء كتبته بعلامة التعجب أو بدونها)
      if (message.content.startsWith('!حجر') || message.content.startsWith('حجر')) return startRPSGame(message, guildId);
      if (message.content.startsWith('!xo') || message.content.startsWith('xo')) return startXOGame(message, guildId);
      if (message.content.startsWith('!ذاكرة') || message.content.startsWith('ذاكرة') || message.content.startsWith('إذاكرة')) return startMemoryGame(message, guildId);
      if (message.content === '!صناديق' || message.content === 'صناديق') return startBoxesGame(message.channel, guildId, userId);

      if (message.content === '!فعالية' || message.content === '!لعبة') {
          if (activeGames.has(message.channel.id)) return message.reply('⏳ فيه لعبة شغالة!');
          const gameChoicer = Math.floor(Math.random() * 14);
          if (gameChoicer === 0) startRouletteGame(message.channel, guildId);
          else if (gameChoicer === 1) startBombGame(message.channel, guildId);
          else if (gameChoicer === 2) startScrambleGame(message.channel, guildId);
          else if (gameChoicer === 3) startButtonGame(message.channel, guildId);
          else if (gameChoicer === 4) startMathGame(message.channel, guildId);
          else if (gameChoicer === 5) startCapitalGame(message.channel, guildId);
          else if (gameChoicer === 6) startReverseGame(message.channel, guildId);
          else if (gameChoicer === 7) startTriviaGame(message.channel, guildId);
          else if (gameChoicer === 8) startGuessGame(message.channel, guildId);
          else if (gameChoicer === 9) startEmojiGame(message.channel, guildId);
          else if (gameChoicer === 10) startMeaningGame(message.channel, guildId);
          else if (gameChoicer === 11) startRPSGame(message, guildId);
          else startBoxesGame(message.channel, guildId, userId);
          return;
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
                  addPoints(guildId, userId, message.author.displayName, message.channel); 
              }
              sendGamesMenu(message.channel);
          }, 3000);
      }

      if (message.content === '!قنبلة') { if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!'); startBombGame(message.channel, guildId); }
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

      if (message.content === '!ت') {
          if (!pointsColl || !economyColl) return message.reply('🏆 قاعدة البيانات غير متصلة.');

          const topPoints = await pointsColl.find({ guildId }).sort({ points: -1 }).limit(3).toArray();
          const topSpeed = await pointsColl.find({ guildId }).sort({ bestTime: 1 }).limit(3).toArray();
          const topMsgs = await pointsColl.find({ guildId }).sort({ messagesCount: -1 }).limit(3).toArray();
          const topRich = await economyColl.find({ guildId }).sort({ balance: -1 }).limit(3).toArray();
          const topLevels = await pointsColl.find({ guildId }).sort({ level: -1, xp: -1 }).limit(3).toArray();

          const pages = [
              new EmbedBuilder().setColor('#FFD700').setTitle('🏆 لوحة صدارة النقاط').setDescription(topPoints.length > 0 ? topPoints.map((d, i) => `${i === 0 ? '👑' : i === 1 ? '🥈' : '🥉'} **${d.name}**: \`${d.points} نقطة\``).join('\n') : 'لا توجد بيانات.'),
              new EmbedBuilder().setColor('#3498DB').setTitle('⚡ لوحة أسرع الأبطال').setDescription(topSpeed.length > 0 && topSpeed.some(d => d.bestTime < 999999) ? topSpeed.filter(d => d.bestTime < 999999).map((d, i) => `⚡ **${d.name}**: \`${d.bestTime} ثانية\``).join('\n') : 'لا توجد أرقام.'),
              new EmbedBuilder().setColor('#E74C3C').setTitle('🔥 لوحة أكثر المتفاعلين').setDescription(topMsgs.length > 0 ? topMsgs.map((d, i) => `🔥 **${d.name}**: \`${d.messagesCount} رسالة\``).join('\n') : 'لا توجد تفاعلات.'),
              new EmbedBuilder().setColor('#2ECC71').setTitle('💎 لوحة أثرياء السيرفر (الكاش)').setDescription(topRich.length > 0 ? topRich.map((d, i) => `💰 <@${d.userId}>: \`$${d.balance.toLocaleString()}\``).join('\n') : 'لا توجد حسابات.'),
              new EmbedBuilder().setColor('#9B59B6').setTitle('🚀 لوحة مستويات الأعضاء (Levels)').setDescription(topLevels.length > 0 ? topLevels.map((d, i) => `⭐ **${d.name}**: المستوى \`Level ${d.level}\``).join('\n') : 'لا توجد لفلات مسجلة.')
          ];

          let page = 0;
          const getRows = (p) => new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('prev').setLabel('◀️ السابق').setStyle(ButtonStyle.Primary).setDisabled(p === 0),
              new ButtonBuilder().setCustomId('next').setLabel('التالي ▶️').setStyle(ButtonStyle.Primary).setDisabled(p === pages.length - 1)
          );

          const msg = await message.channel.send({ embeds: [pages[page]], components: [getRows(page)] });
          const collector = msg.createMessageComponentCollector({ time: 60000 });

          collector.on('collect', async i => {
              if (i.user.id !== userId) return i.reply({ content: '❌ هذه القائمة ليست لك!', ephemeral: true });
              if (i.customId === 'next' && page < pages.length - 1) page++;
              if (i.customId === 'prev' && page > 0) page--;
              await i.update({ embeds: [pages[page]], components: [getRows(page)] });
          });

          collector.on('end', () => {
              msg.edit({ components: [] }).catch(() => {});
          });

          return;
      }

      if (message.content === '!ايقاف') {
          if (!activeGames.has(message.channel.id)) return message.reply('❌ ما فيه لعبة شغالة.');
          activeGames.delete(message.channel.id);
          return message.channel.send('🛑 **تم إيقاف اللعبة الجارية بنجاح!**');
      }
  }
});

client.login(DISCORD_TOKEN);
