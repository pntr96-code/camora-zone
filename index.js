const { Client, GatewayIntentBits, ActivityType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ] 
});

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const activeGames = new Map(); 
// رومات الألعاب العادية
const allowedChannels = ['1547728033580847236', '1547728346081927262'];
// روم الاقتصاد والعقارات (حط أيدي الروم هنا) 👇
const allowedEconomyChannels = ['1547951432186077296']; 

const pointsFilePath = path.join(__dirname, 'points.json');
const wordsFilePath = path.join(__dirname, 'words.json');
const economyFilePath = path.join(__dirname, 'economy.json'); // ملف جديد للاقتصاد

// ----------------- دوال الاقتصاد -----------------
const marketItems = [
    { id: 1, name: 'أرض خام', type: 'أرض', price: 5000, profit: 500 },
    { id: 2, name: 'شقة سكنية', type: 'بيت', price: 15000, profit: 1500 },
    { id: 3, name: 'فيلا فاخرة', type: 'بيت', price: 50000, profit: 6000 },
    { id: 4, name: 'شركة تقنية ناشئة', type: 'شركة', price: 120000, profit: 15000 },
    { id: 5, name: 'مجمع تجاري عملاق', type: 'شركة', price: 500000, profit: 70000 }
];

function loadEconomy() {
    if (fs.existsSync(economyFilePath)) {
        try {
            return JSON.parse(fs.readFileSync(economyFilePath, 'utf8'));
        } catch (e) {
            return {};
        }
    }
    return {};
}

function saveEconomy(data) {
    fs.writeFileSync(economyFilePath, JSON.stringify(data, null, 2), 'utf8');
}

function getEconomyUser(guildId, userId) {
    let data = loadEconomy();
    if (!data[guildId]) data[guildId] = {};
    if (!data[guildId][userId]) {
        data[guildId][userId] = { balance: 1000, properties: [], lastWork: 0, lastProfit: 0 };
    }
    return { data, user: data[guildId][userId] };
}

// ----------------- دوال الألعاب العادية -----------------
function loadWords() {
    if (fs.existsSync(wordsFilePath)) {
        try {
            return JSON.parse(fs.readFileSync(wordsFilePath, 'utf8'));
        } catch (e) {
            return null;
        }
    }
    return null;
}

const wordsData = loadWords() || { writing: ["تحدي السرعة"], scramble: ["برمجة"], capitals: [{ c: "السعودية", cap: "الرياض" }] };

let activeWritingPool = [];
let activeScramblePool = [];
let activeCapitalsPool = [];

function getUniqueItem(pool, masterPool) {
    if (!pool || pool.length === 0) {
        pool.push(...masterPool);
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
    }
    return pool.pop();
}

function loadPoints() {
    if (fs.existsSync(pointsFilePath)) {
        try {
            return JSON.parse(fs.readFileSync(pointsFilePath, 'utf8'));
        } catch (e) {
            return {};
        }
    }
    return {};
}

function savePoints(pointsData) {
    fs.writeFileSync(pointsFilePath, JSON.stringify(pointsData, null, 2), 'utf8');
}

function addPoints(guildId, userId, userTag, channel, timeElapsed = null) {
    let pointsData = loadPoints();
    if (!pointsData[guildId]) pointsData[guildId] = {};
    if (!pointsData[guildId][userId]) {
        pointsData[guildId][userId] = { name: userTag, points: 0, speedWins: 0, bestTime: 999999, messagesCount: 0 };
    }

    const userData = pointsData[guildId][userId];
    userData.name = userTag;
    userData.points += 10;
    
    if (timeElapsed !== null) {
        userData.speedWins += 1;
        if (timeElapsed < userData.bestTime) {
            userData.bestTime = timeElapsed;
        }
    }
    savePoints(pointsData);
    channel.send(`⭐ **${userTag}** كسب **10 نقاط**! (رصيده: ${userData.points} نقطة)`);
}

function trackUserMessage(guildId, userId, userTag) {
    let pointsData = loadPoints();
    if (!pointsData[guildId]) pointsData[guildId] = {};
    if (!pointsData[guildId][userId]) {
        pointsData[guildId][userId] = { name: userTag, points: 0, speedWins: 0, bestTime: 999999, messagesCount: 0 };
    }
    pointsData[guildId][userId].name = userTag;
    pointsData[guildId][userId].messagesCount += 1;
    savePoints(pointsData);
}

client.once('clientReady', () => {
  console.log(`[BOT STATUS] Camora Zone is Online! 🎮`);
  client.user.setActivity('𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞', { type: ActivityType.Playing });
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  const guildId = message.guild.id;

  // ==========================================
  // 🏢 قسم الاقتصاد والعقارات (يعمل فقط في روم الاقتصاد)
  // ==========================================
  if (allowedEconomyChannels.includes(message.channel.id)) {
      
      if (message.content === '!اقتصاد') {
          const menu = `
🏦 **النظام الاقتصادي وسوق العقارات** 🏦
-----------------------------------------
💵 \`!راتب\` : استلم راتبك (كل ساعة)
💳 \`!بنك\` : لمعرفة رصيدك الحالي
🏪 \`!سوق\` : عرض العقارات والشركات المعروضة للبيع
🛒 \`!شراء [رقم]\` : لشراء عقار أو شركة (مثال: !شراء 1)
📉 \`!بيع [رقم]\` : لبيع أملاكك واسترجاع 80% من قيمتها
🏠 \`!املاكي\` : عرض ممتلكاتك الحالية
📈 \`!ارباح\` : استلام أرباح أملاكك (كل 24 ساعة)
          `;
          return message.channel.send(menu);
      }

      if (message.content === '!بنك') {
          const { user } = getEconomyUser(guildId, message.author.id);
          return message.reply(`💳 رصيدك الحالي في البنك هو: **$${user.balance.toLocaleString()}**`);
      }

      if (message.content === '!راتب') {
          let { data, user } = getEconomyUser(guildId, message.author.id);
          const now = Date.now();
          const cooldown = 60 * 60 * 1000; // ساعة واحدة
          if (now - user.lastWork < cooldown) {
              const minutesLeft = Math.ceil((cooldown - (now - user.lastWork)) / 60000);
              return message.reply(`⏳ باقي لك **${minutesLeft} دقيقة** عشان تقدر تستلم الراتب مرة ثانية!`);
          }
          const salary = Math.floor(Math.random() * 500) + 500; // راتب عشوائي بين 500 و 1000
          user.balance += salary;
          user.lastWork = now;
          saveEconomy(data);
          return message.reply(`💵 استلمت راتبك بنجاح: **$${salary}**! رصيدك صار: **$${user.balance.toLocaleString()}**`);
      }

      if (message.content === '!سوق') {
          let shopMenu = `🏪 **سوق العقارات والشركات** 🏪\n\n`;
          marketItems.forEach(item => {
              shopMenu += `**[${item.id}]** ${item.name} (${item.type})\n💰 السعر: **$${item.price.toLocaleString()}** | 📈 الأرباح اليومية: **$${item.profit.toLocaleString()}**\n\n`;
          });
          shopMenu += `💡 *للشراء اكتب: !شراء يتبعه رقم العقار*`;
          return message.channel.send(shopMenu);
      }

      if (message.content.startsWith('!شراء ')) {
          const itemId = parseInt(message.content.split(' ')[1]);
          const item = marketItems.find(i => i.id === itemId);
          
          if (!item) return message.reply('❌ رقم العقار غير صحيح! شيك على الـ `!سوق`.');
          
          let { data, user } = getEconomyUser(guildId, message.author.id);
          
          if (user.balance < item.price) {
              return message.reply(`💸 رصيدك ما يكفي! تحتاج **$${(item.price - user.balance).toLocaleString()}** زيادة عشان تشتري **${item.name}**.`);
          }

          user.balance -= item.price;
          user.properties.push(item.id);
          saveEconomy(data);
          return message.reply(`🎉 مبروووك! شريت **${item.name}** بنجاح! رصيدك المتبقي: **$${user.balance.toLocaleString()}**`);
      }

      if (message.content === '!املاكي') {
          const { user } = getEconomyUser(guildId, message.author.id);
          if (user.properties.length === 0) return message.reply('مفلس! ما عندك أي عقارات أو شركات حالياً 😅.');
          
          let propsMsg = `🏠 **أملاك ${message.author.displayName}:**\n\n`;
          let totalDaily = 0;
          user.properties.forEach(propId => {
              const item = marketItems.find(i => i.id === propId);
              if (item) {
                  propsMsg += `🔹 **${item.name}** (أرباحها: $${item.profit})\n`;
                  totalDaily += item.profit;
              }
          });
          propsMsg += `\n📈 **إجمالي الأرباح المتوقعة يومياً: $${totalDaily.toLocaleString()}**`;
          return message.channel.send(propsMsg);
      }

      if (message.content.startsWith('!بيع ')) {
          const itemId = parseInt(message.content.split(' ')[1]);
          let { data, user } = getEconomyUser(guildId, message.author.id);
          
          const propIndex = user.properties.indexOf(itemId);
          if (propIndex === -1) return message.reply('❌ أنت ما تملك هذا العقار عشان تبيعه!');

          const item = marketItems.find(i => i.id === itemId);
          const sellPrice = Math.floor(item.price * 0.8); // يبيع بخصم 20%
          
          user.properties.splice(propIndex, 1);
          user.balance += sellPrice;
          saveEconomy(data);
          
          return message.reply(`🤝 تم بيع **${item.name}** مقابل **$${sellPrice.toLocaleString()}**! رصيدك صار: **$${user.balance.toLocaleString()}**`);
      }

      if (message.content === '!ارباح') {
          let { data, user } = getEconomyUser(guildId, message.author.id);
          if (user.properties.length === 0) return message.reply('❌ ما عندك أملاك تجيب لك أرباح! روح للـ `!سوق` واشتري.');

          const now = Date.now();
          const cooldown = 24 * 60 * 60 * 1000; // 24 ساعة
          if (now - user.lastProfit < cooldown) {
              const hoursLeft = Math.ceil((cooldown - (now - user.lastProfit)) / (60 * 60 * 1000));
              return message.reply(`⏳ باقي لك **${hoursLeft} ساعة** عشان تقدر تجمع أرباحك مرة ثانية!`);
          }

          let totalProfit = 0;
          user.properties.forEach(propId => {
              const item = marketItems.find(i => i.id === propId);
              if (item) totalProfit += item.profit;
          });

          user.balance += totalProfit;
          user.lastProfit = now;
          saveEconomy(data);
          return message.reply(`📈 استلمت أرباح أملاكك بنجاح: **$${totalProfit.toLocaleString()}**! رصيدك صار: **$${user.balance.toLocaleString()}**`);
      }
  }

  // ==========================================
  // 🎮 قسم الألعاب العادية (يعمل فقط في رومات الألعاب)
  // ==========================================
  if (allowedChannels.includes(message.channel.id)) {
      trackUserMessage(guildId, message.author.id, message.author.displayName);

      function sendGamesMenu(channel) {
          const menu = `
🎮 **قائمة ألعاب 𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞** 🎮
-----------------------------------------
🔪 \`!القاتل\` : فعالية تحقيق ونقاش
❌ \`!xo\` : تحدي إكس أو 
🎲 \`!روليت\` : لعبة الحظ الروسية
💣 \`!قنبلة\` : تحدي فك القنبلة
⚡ \`!زر\` : تحدي أسرع ضغطة
⌨️ \`!كتابة\` : تحدي أسرع كاتب
🧩 \`!فكك\` : ترتيب الحروف المبعثرة
🔢 \`!رياضيات\` : تحدي الحساب السريع
➗ \`!قسمة\` : تحدي الضرب والقسمة
🌍 \`!عواصم\` : خمن عاصمة الدولة
-----------------------------------------
🏆 **لوحة الصدارة:** \`!ت ن\` (نقاط) | \`!ت س\` (سرعة) | \`!ت ت\` (تفاعل)
🛑 \`!ايقاف\` : لإلغاء أي لعبة شغالة
          `;
          channel.send(menu);
      }

      if (message.content === '!العاب') {
          return sendGamesMenu(message.channel);
      }

      // [باقي أكواد الألعاب العادية موجودة وتعمل هنا بنفس طريقتها السابقة بدون تغيير مساحتها لتقليل الزحمة في الرد]
      // (انسخ ألأكواد حقت الألعاب من الملف اللي رفعته لك في الردود السابقة وحطها هنا، الكود جاهز ومفصول بنجاح!)
  }
});

client.login(DISCORD_TOKEN);
