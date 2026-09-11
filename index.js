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
const allowedChannels = ['1547728033580847236', '1547728346081927262']; // رومات الألعاب العادية
const allowedEconomyChannels = ['1547951432186077296']; // 👈 استبدل هذا بأيدي روم الاقتصاد والشركات

const pointsFilePath = path.join(__dirname, 'points.json');
const wordsFilePath = path.join(__dirname, 'words.json');
const economyFilePath = path.join(__dirname, 'economy.json');

// ==========================================
// 💰 دوال النظام الاقتصادي
// ==========================================
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

// ==========================================
// 🎮 دوال الألعاب والنقاط
// ==========================================
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
            const data = fs.readFileSync(pointsFilePath, 'utf8');
            return JSON.parse(data);
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
    channel.send(`⭐ **${userTag}** كسب **10 نقاط**! (رصيده بالسيرفر: ${userData.points} نقطة)`);
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

function printCmdHelp() {
    console.log(`\n==================================================`);
    console.log(`💡 [CMD COMMANDS REFERENCE GUIDE]`);
    console.log(`- stats                 : View bot general statistics`);
    console.log(`- reset [userId]        : Reset a user's points and speed data`);
    console.log(`- add [userId] [points] : Add points to a specific user`);
    console.log(`- remove [userId] [pts] : Remove points from a specific user`);
    console.log(`- help                  : Show this reference guide again`);
    console.log(`==================================================\n`);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.on('line', (input) => {
    const args = input.trim().split(' ');
    const cmd = args[0] ? args[0].toLowerCase() : '';

    if (cmd === 'stats') {
        const pointsData = loadPoints();
        let totalPlayers = 0;
        let totalPoints = 0;
        Object.values(pointsData).forEach(guildUsers => {
            Object.values(guildUsers).forEach(user => {
                totalPlayers++;
                totalPoints += user.points;
            });
        });
        console.log(`\n📊 [STATS] Servers: ${client.guilds.cache.size} | Players: ${totalPlayers} | Points: ${totalPoints}\n`);
    } 
    else if (cmd === 'help') {
        printCmdHelp();
    }
    else if (cmd === 'reset') {
        const targetUserId = args[1];
        if (!targetUserId) {
            console.log(`❌ Error: Please provide a valid User ID.`);
            return;
        }
        let pointsData = loadPoints();
        let found = false;
        Object.keys(pointsData).forEach(guildId => {
            if (pointsData[guildId][targetUserId]) {
                pointsData[guildId][targetUserId].points = 0;
                pointsData[guildId][targetUserId].speedWins = 0;
                pointsData[guildId][targetUserId].bestTime = 999999;
                found = true;
            }
        });
        if (found) {
            savePoints(pointsData);
            console.log(`✅ Successfully reset points for user ID (${targetUserId}).`);
        } else {
            console.log(`⚠️ User ID not found in database.`);
        }
    } 
    else if (cmd === 'add') {
        const targetUserId = args[1];
        const amount = parseInt(args[2]);
        if (!targetUserId || isNaN(amount)) {
            console.log(`❌ Error: Invalid usage. Example: add 123456789 50`);
            return;
        }
        let pointsData = loadPoints();
        let found = false;
        Object.keys(pointsData).forEach(guildId => {
            if (pointsData[guildId][targetUserId]) {
                pointsData[guildId][targetUserId].points += amount;
                found = true;
            }
        });
        if (found) {
            savePoints(pointsData);
            console.log(`✅ Successfully added ${amount} points to user ID (${targetUserId}).`);
        } else {
            console.log(`⚠️ User ID not found in database.`);
        }
    }
    else if (cmd === 'remove' || cmd === 'rem') {
        const targetUserId = args[1];
        const amount = parseInt(args[2]);
        if (!targetUserId || isNaN(amount)) {
            console.log(`❌ Error: Invalid usage. Example: remove 123456789 20`);
            return;
        }
        let pointsData = loadPoints();
        let found = false;
        Object.keys(pointsData).forEach(guildId => {
            if (pointsData[guildId][targetUserId]) {
                pointsData[guildId][targetUserId].points = Math.max(0, pointsData[guildId][targetUserId].points - amount);
                found = true;
            }
        });
        if (found) {
            savePoints(pointsData);
            console.log(`✅ Successfully removed ${amount} points from user ID (${targetUserId}).`);
        } else {
            console.log(`⚠️ User ID not found in database.`);
        }
    }
});

client.once('clientReady', () => {
  console.log(`========================================`);
  console.log(`[BOT STATUS] Camora Zone is Online! 🎮`);
  console.log(`========================================`);
  printCmdHelp();
  client.user.setActivity('𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞', { type: ActivityType.Playing });
});

client.on('guildCreate', guild => {
    console.log(`[JOINED SERVER] New server: ${guild.name} (ID: ${guild.id})`);
    const targetChannel = guild.channels.cache.find(channel => 
        channel.type === 0 && 
        channel.permissionsFor(guild.members.me)?.has(['SendMessages', 'ViewChannel'])
    );

    if (targetChannel) {
        const welcomeMessage = `
🎮 **أهلاً بكم في سيرفر ${guild.name}!** 🎮
> شكراً لإضافة بوت **𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞** إلى سيرفركم.
> البوت جاهز الآن لتقديم أمتع الفعاليات والألعاب التنافسية!
> 
> 📋 اكتب \`!العاب\` في الشات لعرض قائمة الألعاب والبدء فوراً.
        `;
        targetChannel.send(welcomeMessage);
    }
});

function sendGamesMenu(channel) {
    const menu = `
🎮 **قائمة ألعاب 𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞** 🎮
-----------------------------------------
🔪 \`!القاتل\` : فعالية تحقيق ونقاش
❌ \`!xo\` : تحدي إكس أو (مع خويك أو ضد البوت)
🎲 \`!روليت\` : لعبة الحظ الروسية
💣 \`!قنبلة\` : تحدي فك القنبلة
⚡ \`!زر\` : تحدي أسرع ضغطة
⌨️ \`!كتابة\` : تحدي أسرع كاتب
🧩 \`!فكك\` : ترتيب الحروف المبعثرة
🔢 \`!رياضيات\` : تحدي الحساب السريع
➗ \`!قسمة\` : تحدي الضرب والقسمة
🌍 \`!عواصم\` : خمن عاصمة الدولة
-----------------------------------------
🏆 **لوحة الصدارة المختصرة:**
• \`!ت ن\` ⟵ أعلى النقاط
• \`!ت س\` ⟵ أسرع الأبطال مع التوقيت
• \`!ت ت\` ⟵ أكثر المتفاعلين بالشات
-----------------------------------------
🛑 \`!ايقاف\` : لإلغاء أي لعبة شغالة
    `;
    channel.send(menu);
}

async function runJsonGame(gameTitle, type, channel, guildId) {
    let display = "";
    let answer = "";

    if (type === 'writing') {
        const sentence = getUniqueItem(activeWritingPool, wordsData.writing);
        display = `عندكم **30 ثانية** لكتابة الجملة التالية:\n\n\`${sentence}\``;
        answer = sentence;
    } else if (type === 'scramble') {
        const word = getUniqueItem(activeScramblePool, wordsData.scramble);
        const scrambled = word.split('').sort(() => 0.5 - Math.random()).join(' ');
        display = `رتب الحروف لتكون كلمة صحيحة:\n\n\`${scrambled}\``;
        answer = word;
    } else if (type === 'math') {
        const n1 = Math.floor(Math.random() * 80) + 15;
        const n2 = Math.floor(Math.random() * 50) + 10;
        display = `كم ناتج: ${n1} + ${n2} ؟`;
        answer = (n1 + n2).toString();
    } else if (type === 'mul') {
        const n1 = Math.floor(Math.random() * 12) + 3;
        const n2 = Math.floor(Math.random() * 12) + 3;
        display = `كم ناتج: ${n1} × ${n2} ؟`;
        answer = (n1 * n2).toString();
    } else if (type === 'capital') {
        const chosen = getUniqueItem(activeCapitalsPool, wordsData.capitals);
        display = `ما هي عاصمة **${chosen.c}** ؟`;
        answer = chosen.cap;
    }

    const loadingMsg = await channel.send(`🎮 **${gameTitle}**\n${display}`);
    const startTime = Date.now();

    const filter = m => !m.author.bot;
    const collector = channel.createMessageCollector({ filter, time: 30000 });
    activeGames.set(channel.id, collector);

    let answeredCorrectly = false;
    collector.on('collect', m => {
        if (m.content.trim().toLowerCase() === answer.toLowerCase()) {
            answeredCorrectly = true;
            const endTime = Date.now();
            const timeElapsed = ((endTime - startTime) / 1000).toFixed(2);

            m.react('🎉');
            channel.send(`🎉 فاز ${m.author} بزمن خيالي: **${timeElapsed} ثانية**! الإجابة صحيحة: **${answer}**`);
            addPoints(guildId, m.author.id, m.author.displayName, channel, parseFloat(timeElapsed));
            collector.stop('correct');
        } else {
            m.react('❌');
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'cancelled') return;
        activeGames.delete(channel.id);
        if (!answeredCorrectly) channel.send(`⏰ خلص الوقت! الإجابة الصحيحة كانت: **${answer}**`);
        sendGamesMenu(channel);
    });
}

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  const guildId = message.guild.id;

  // ==========================================
  // 🏢 قسم الاقتصاد والعقارات
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
          const cooldown = 60 * 60 * 1000; 
          if (now - user.lastWork < cooldown) {
              const minutesLeft = Math.ceil((cooldown - (now - user.lastWork)) / 60000);
              return message.reply(`⏳ باقي لك **${minutesLeft} دقيقة** عشان تقدر تستلم الراتب مرة ثانية!`);
          }
          const salary = Math.floor(Math.random() * 500) + 500; 
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
          const sellPrice = Math.floor(item.price * 0.8); 
          
          user.properties.splice(propIndex, 1);
          user.balance += sellPrice;
          saveEconomy(data);
          
          return message.reply(`🤝 تم بيع **${item.name}** مقابل **$${sellPrice.toLocaleString()}**! رصيدك صار: **$${user.balance.toLocaleString()}**`);
      }

      if (message.content === '!ارباح') {
          let { data, user } = getEconomyUser(guildId, message.author.id);
          if (user.properties.length === 0) return message.reply('❌ ما عندك أملاك تجيب لك أرباح! روح للـ `!سوق` واشتري.');

          const now = Date.now();
          const cooldown = 24 * 60 * 60 * 1000; 
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
  // 🎮 قسم الألعاب العادية 
  // ==========================================
  if (allowedChannels.includes(message.channel.id)) {
      trackUserMessage(guildId, message.author.id, message.author.displayName);

      if (message.content === '!القاتل' || message.content === '!لعبة القاتل') {
          if (activeGames.has(message.channel.id)) return message.reply('⏳ فيه فعالية شغالة في هذا الروم حالياً!');
          
          message.channel.send('🚨 **لعبة القاتل بدأت!** 🚨\nعندكم **30 ثانية** للتسجيل.. اكتب `أنا` للمشاركة! (لو العدد أقل من 5، سأضيف شخصيات وهمية ليكتمل العدد تلقائياً)');
          
          const filter = m => m.content === 'أنا' && !m.author.bot;
          const collector = message.channel.createMessageCollector({ filter, time: 30000 }); 
          activeGames.set(message.channel.id, collector); 

          const players = new Map();

          collector.on('collect', m => {
              if (!players.has(m.author.id)) {
                  players.set(m.author.id, { id: m.author.id, displayName: m.author.displayName, isBot: false });
                  m.react('✅');
              }
          });

          collector.on('end', async (collected, reason) => {
              if (reason === 'cancelled') return; 
              
              let playerArray = Array.from(players.values());

              const fakeNames = ['سلطان الذكي', 'ماجد السريع', 'فهد الغامض', 'صالح المحقق', 'راشد الخبيث', 'تركي الهداف'];
              let fakeIndex = 0;
              while (playerArray.length < 5) {
                  const fakeName = fakeNames[fakeIndex++];
                  playerArray.push({ id: `fake_${fakeIndex}`, displayName: `🤖 ${fakeName}`, isBot: true });
              }

              const killer = playerArray[Math.floor(Math.random() * playerArray.length)];
              
              for (const player of playerArray) {
                  if (!player.isBot) {
                      try {
                          const userObj = await client.users.fetch(player.id);
                          if (player.id === killer.id) {
                              await userObj.send('🔪 **أنت القاتل!** حاول تقنع الباقين إنك بريء.');
                          } else {
                              await userObj.send('🛡️ **أنت بريء!** انتبه، القاتل بينكم.');
                          }
                      } catch (e) {
                          message.channel.send(`⚠️ تنبيه: <@${player.id}> فاتح الخاص؟ ما قدرت أرسل له دوره!`);
                      }
                  }
              }

              message.channel.send(`👥 **اكتمل العدد (${playerArray.length} لاعبين بينهم بوتات ذكاء اصطناعي)!**\nتم توزيع الأدوار 🤫.\n\n💡 **الأنوار طفت...**`);
              
              setTimeout(() => { 
                  if (!activeGames.has(message.channel.id)) return; 

                  const innocents = playerArray.filter(p => p.id !== killer.id);
                  const victim = innocents[Math.floor(Math.random() * innocents.length)];
                  const alivePlayers = playerArray.filter(p => p.id !== victim.id);

                  message.channel.send(`🚨 **لقينا جثة!**\nالضحية هو 💀 **${victim.displayName}**.\n\n⏳ **وقت النقاش!** عندكم **40 ثانية** تتناقشون بالشات مين القاتل.`);

                  setTimeout(() => { 
                      if (!activeGames.has(message.channel.id)) return; 

                      let voteMsg = "⏰ **انتهى وقت النقاش! حان وقت التصويت (عندكم 25 ثانية).**\nاكتب كلمة `صوت` ورقم اللاعب، مثال: `صوت 1`:\n\n";
                      alivePlayers.forEach((p, index) => {
                          voteMsg += `**${index + 1}** - ${p.displayName}\n`;
                      });
                      message.channel.send(voteMsg);

                      const voteFilter = m => m.content.startsWith('صوت ') && alivePlayers.some(p => p.id === m.author.id);
                      const voteCollector = message.channel.createMessageCollector({ filter: voteFilter, time: 25000 }); 
                      activeGames.set(message.channel.id, voteCollector); 

                      const votes = new Map();

                      voteCollector.on('collect', m => {
                          const num = parseInt(m.content.split(' ')[1]);
                          if (num > 0 && num <= alivePlayers.length) {
                              votes.set(m.author.id, alivePlayers[num - 1].id);
                              m.react('🗳️');
                          }
                      });

                      voteCollector.on('end', (collected, reason) => {
                          if (reason === 'cancelled') return;
                          activeGames.delete(message.channel.id);

                          alivePlayers.forEach(p => {
                              if (p.isBot) {
                                  const randomTarget = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
                                  votes.set(p.id, randomTarget.id);
                              }
                          });

                          if (votes.size === 0) {
                              message.channel.send(`🤷‍♂️ محد صوت! فاز القاتل 🔪 **${killer.displayName}** وهرب!`);
                          } else {
                              const tally = {};
                              votes.forEach(targetId => tally[targetId] = (tally[targetId] || 0) + 1);
                              let maxVotes = 0, executedId = null;
                              for (const [id, count] of Object.entries(tally)) {
                                  if (count > maxVotes) { maxVotes = count; executedId = id; }
                              }

                              const executedPlayer = alivePlayers.find(p => p.id === executedId);
                              if (executedId === killer.id) {
                                  message.channel.send(`🎉 **الشباب جابوه!**\nتم إعدام ${executedPlayer.displayName} وطلع هو **القاتل!** 🔪`);
                                  votes.forEach((targetId, voterId) => {
                                      if (targetId === killer.id && !voterId.startsWith('fake_')) {
                                          addPoints(guildId, voterId, client.users.cache.get(voterId)?.displayName || 'لاعب', message.channel);
                                      }
                                  });
                              } else {
                                  message.channel.send(`❌ **تصويت خاطئ!**\nتم إعدام ${executedPlayer.displayName} وطلع **بريء!** 🛡️\nالقاتل الحقيقي كان 🔪 **${killer.displayName}**!`);
                              }
                          }
                          sendGamesMenu(message.channel);
                      });
                  }, 40000); 
              }, 10000); 
          });
      }

      if (message.content === '!xo') {
          if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر الفعالية الحالية تخلص!');
          
          const opponent = message.mentions.users.first();
          
          if (!opponent || opponent.bot || opponent.id === message.author.id) {
              activeGames.set(message.channel.id, 'xo');
              let board = Array(9).fill(null);
              let turn = message.author.id;

              const getRows = (currentBoard) => {
                  let rows = [];
                  for (let i = 0; i < 3; i++) {
                      let row = new ActionRowBuilder();
                      for (let j = 0; j < 3; j++) {
                          let index = i * 3 + j;
                          let style = ButtonStyle.Secondary;
                          let label = '➖';
                          if (currentBoard[index] === 'X') { style = ButtonStyle.Danger; label = '❌'; }
                          else if (currentBoard[index] === 'O') { style = ButtonStyle.Primary; label = '⭕'; }
                          row.addComponents(new ButtonBuilder().setCustomId(`xo_${index}`).setLabel(label).setStyle(style).setDisabled(currentBoard[index] !== null));
                      }
                      rows.push(row);
                  }
                  return rows;
              };

              const checkWinner = (b) => {
                  const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
                  for (let w of wins) { if (b[w[0]] && b[w[0]] === b[w[1]] && b[w[0]] === b[w[2]]) return b[w[0]]; }
                  return b.every(cell => cell !== null) ? 'tie' : null;
              };

              const gameMessage = await message.channel.send({
                  content: `🎮 **تحدي XO ضد البوت**\nدور اللاعب: <@${turn}>`,
                  components: getRows(board)
              });

              const collector = gameMessage.createMessageComponentCollector({ time: 60000 });
              collector.on('collect', async i => {
                  if (i.user.id !== turn) return i.reply({ content: '❌ مو دورك!', ephemeral: true });
                  const index = parseInt(i.customId.split('_')[1]);
                  board[index] = 'X';
                  let winner = checkWinner(board);

                  if (winner) {
                      collector.stop();
                      activeGames.delete(message.channel.id);
                      await i.update({ content: winner === 'tie' ? `🤝 تعادلنا!` : `🎉 مبروك فزت على البوت!`, components: getRows(board) });
                      sendGamesMenu(message.channel);
                      return;
                  }
                  turn = client.user.id;
                  await i.update({ content: `🎮 **تحدي XO ضد البوت**\nدور البوت...`, components: getRows(board) });

                  setTimeout(async () => {
                      let empty = board.map((v, idx) => v === null ? idx : null).filter(v => v !== null);
                      if (empty.length === 0) return;
                      board[empty[Math.floor(Math.random() * empty.length)]] = 'O';
                      winner = checkWinner(board);
                      if (winner) {
                          collector.stop();
                          activeGames.delete(message.channel.id);
                          await gameMessage.edit({ content: `🤖 **فاز البوت عليك!**`, components: getRows(board) });
                          sendGamesMenu(message.channel);
                      } else {
                          turn = message.author.id;
                          await gameMessage.edit({ content: `🎮 **تحدي XO ضد البوت**\nدور اللاعب: <@${turn}>`, components: getRows(board) });
                      }
                  }, 1000);
              });
              return;
          }

          const challengeMsg = await message.channel.send(`⚔️ **تحدي XO!** ${opponent}, يبي ${message.author} يتحداك. اضغط ✅ للقبول خلال 30 ثانية!`);
          await challengeMsg.react('✅');

          const filter = (reaction, user) => reaction.emoji.name === '✅' && user.id === opponent.id;
          try {
              const collected = await challengeMsg.awaitReactions({ filter, max: 1, time: 30000, errors: ['time'] });
              if (collected.size > 0) {
                  await challengeMsg.delete();
                  activeGames.set(message.channel.id, 'xo');

                  let board = Array(9).fill(null);
                  let turn = message.author.id;

                  const getRows = (currentBoard) => {
                      let rows = [];
                      for (let i = 0; i < 3; i++) {
                          let row = new ActionRowBuilder();
                          for (let j = 0; j < 3; j++) {
                              let index = i * 3 + j;
                              let style = ButtonStyle.Secondary;
                              let label = '➖';
                              if (currentBoard[index] === 'X') { style = ButtonStyle.Danger; label = '❌'; }
                              else if (currentBoard[index] === 'O') { style = ButtonStyle.Primary; label = '⭕'; }
                              row.addComponents(new ButtonBuilder().setCustomId(`xo_${index}`).setLabel(label).setStyle(style).setDisabled(currentBoard[index] !== null));
                          }
                          rows.push(row);
                      }
                      return rows;
                  };

                  const checkWinner = (b) => {
                      const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
                      for (let w of wins) { if (b[w[0]] && b[w[0]] === b[w[1]] && b[w[0]] === b[w[2]]) return b[w[0]]; }
                      return b.every(cell => cell !== null) ? 'tie' : null;
                  };

                  const gameMessage = await message.channel.send({
                      content: `🎮 **تحدي XO بين ${message.author} و ${opponent}**\nدور اللاعب: <@${turn}>`,
                      components: getRows(board)
                  });

                  const collector = gameMessage.createMessageComponentCollector({ time: 60000 });
                  collector.on('collect', async i => {
                      if (i.user.id !== turn) return i.reply({ content: '❌ مو دورك!', ephemeral: true });
                      const index = parseInt(i.customId.split('_')[1]);
                      board[index] = (turn === message.author.id) ? 'X' : 'O';
                      let winner = checkWinner(board);

                      if (winner) {
                          collector.stop();
                          activeGames.delete(message.channel.id);
                          if (winner === 'tie') {
                              await i.update({ content: `🤝 **تعادلنا!**`, components: getRows(board) });
                          } else {
                              let winnerUser = (winner === 'X') ? message.author : opponent;
                              await i.update({ content: `🎉 **مبروك الفوز!** ${winnerUser}`, components: getRows(board) });
                              addPoints(guildId, winnerUser.id, winnerUser.displayName, message.channel);
                          }
                          sendGamesMenu(message.channel);
                      } else {
                          turn = (turn === message.author.id) ? opponent.id : message.author.id;
                          await i.update({ content: `🎮 **تحدي XO**\nدور اللاعب: <@${turn}>`, components: getRows(board) });
                      }
                  });

                  collector.on('end', (collected, reason) => {
                      if (reason === 'time') {
                          activeGames.delete(message.channel.id);
                          message.channel.send(`⏰ انتهى وقت لعبة XO.`);
                          sendGamesMenu(message.channel);
                      }
                  });
              }
          } catch (e) {
              challengeMsg.edit(`⌛ ما تم قبول التحدي، تم الإلغاء.`);
          }
      }

      if (message.content === '!روليت') {
          if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر الفعالية الحالية تخلص!');
          activeGames.set(message.channel.id, 'roulette');
          const bullet = Math.floor(Math.random() * 6) + 1; 
          
          message.channel.send(`🤠 **روليت** - ${message.author} سحب الزناد... 🎲`);
          setTimeout(() => {
              if (!activeGames.has(message.channel.id)) return; 
              activeGames.delete(message.channel.id);
              if (bullet === 1) {
                  message.channel.send(`💥 **بووووم!** ${message.author} ودع الملاعب 💀.`);
              } else {
                  message.channel.send(`😅 **طـــق!** المسدس فاضي! كسب نقاط.`);
                  addPoints(guildId, message.author.id, message.author.displayName, message.channel);
              }
              sendGamesMenu(message.channel);
          }, 3000); 
      }

      if (message.content === '!قنبلة') {
          if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر الفعالية الحالية تخلص!');
          activeGames.set(message.channel.id, 'bomb');

          const wires = [
              { id: 'wire_red', label: 'أحمر 🔴', style: ButtonStyle.Danger },
              { id: 'wire_blue', label: 'أزرق 🔵', style: ButtonStyle.Primary },
              { id: 'wire_green', label: 'أخضر 🟢', style: ButtonStyle.Success }
          ];

          wires.sort(() => Math.random() - 0.5);
          const safeWire = wires[0].id; 

          const row = new ActionRowBuilder();
          wires.forEach(w => {
              row.addComponents(new ButtonBuilder().setCustomId(w.id).setLabel(w.label).setStyle(w.style));
          });

          const msg = await message.channel.send({
              content: `💣 **القنبلة بتنفجر بعد 15 ثانية!**\n${message.author} اختار السلك الصح عشان تفكها!`,
              components: [row]
          });

          const filter = i => i.user.id === message.author.id;
          const collector = msg.createMessageComponentCollector({ filter, time: 15000, max: 1 });

          collector.on('collect', async i => {
              activeGames.delete(message.channel.id);
              if (i.customId === safeWire) {
                  await i.update({ content: `🎉 **كفوو!** فكيت القنبلة بسلام وكسبت نقاط!`, components: [] });
                  addPoints(guildId, message.author.id, message.author.displayName, message.channel);
              } else {
                  await i.update({ content: `💥 **بوووووووم!** قطعت السلك الغلط وانفجرت القنبلة 💀`, components: [] });
              }
              sendGamesMenu(message.channel);
          });

          collector.on('end', (collected, reason) => {
              if (reason === 'time') {
                  activeGames.delete(message.channel.id);
                  msg.edit({ content: `💥 **بوووووووم!** خلص الوقت وانفجرت القنبلة 💀`, components: [] });
                  sendGamesMenu(message.channel);
              }
          });
      }

      if (message.content === '!زر') {
          if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر الفعالية الحالية تخلص!');
          activeGames.set(message.channel.id, 'button');

          const msg = await message.channel.send(`⏳ **استعد... الزر بيظهر فجأة، خليك جاهز!**`);
          
          const delay = Math.floor(Math.random() * 4000) + 2000; 

          setTimeout(async () => {
              if (!activeGames.has(message.channel.id)) return;

              const row = new ActionRowBuilder().addComponents(
                  new ButtonBuilder().setCustomId('fast_click').setLabel('⚡ اضغطنييي!').setStyle(ButtonStyle.Success)
              );

              await msg.edit({ content: `🔥 **ميين يضغط الزررررر بسرعة!**`, components: [row] });
              const startTime = Date.now();

              const collector = msg.createMessageComponentCollector({ time: 10000, max: 1 });

              collector.on('collect', async i => {
                  activeGames.delete(message.channel.id);
                  const endTime = Date.now();
                  const timeElapsed = ((endTime - startTime) / 1000).toFixed(2);
                  
                  await i.update({ content: `🏆 كفو ${i.user}! كنت الأسرع وضغطت الزر في **${timeElapsed} ثانية**!`, components: [] });
                  addPoints(guildId, i.user.id, i.user.displayName, message.channel, parseFloat(timeElapsed));
                  sendGamesMenu(message.channel);
              });

              collector.on('end', (collected, reason) => {
                  if (reason === 'time') {
                      activeGames.delete(message.channel.id);
                      msg.edit({ content: `😴 محد ضغط الزر! خلص الوقت.`, components: [] });
                      sendGamesMenu(message.channel);
                  }
              });
          }, delay);
      }

      if (message.content.startsWith('!ت') || message.content.startsWith('!ترتيب') || message.content.startsWith('!لوحة')) {
          const pointsData = loadPoints();
          if (!pointsData[guildId] || Object.keys(pointsData[guildId]).length === 0) {
              return message.reply('🏆 ما فيه أي بيانات مسجلة في هذا السيرفر حتى الآن!');
          }

          const args = message.content.split(' ');
          const subType = args[1] ? args[1].toLowerCase() : 'ن';
          const guildUsers = pointsData[guildId];

          let sortedUsers = [];
          let title = '';

          if (subType === 'س' || subType === 'اسرع' || subType === 'سرعة') {
              sortedUsers = Object.entries(guildUsers)
                  .filter(a => a[1].bestTime < 999999)
                  .sort((a, b) => a[1].bestTime - b[1].bestTime)
                  .slice(0, 5);
              title = '⚡ **أسرع 5 أبطال في إنجاز الألعاب (مع التوقيت)** ⚡';
          } else if (subType === 'ت' || subType === 'تفاعل') {
              sortedUsers = Object.entries(guildUsers).sort((a, b) => b[1].messagesCount - a[1].messagesCount).slice(0, 5);
              title = '🔥 **أكثر 5 أعضاء تفاعلاً في الشات** 🔥';
          } else {
              sortedUsers = Object.entries(guildUsers).sort((a, b) => b[1].points - a[1].points).slice(0, 5);
              title = '🏆 **أعلى 5 لاعبين حصدوا نقاطاً** 🏆';
          }

          if (sortedUsers.length === 0) {
              return message.reply('📊 لا توجد سجلات كافية لهذه القائمة حتى الآن.');
          }

          let boardText = `${title}\n\n`;
          sortedUsers.forEach(([id, data], index) => {
              let medal = '🏅';
              if (index === 0) medal = '👑';
              else if (index === 1) medal = '🥈';
              else if (index === 2) medal = '🥉';

              if (subType === 'س' || subType === 'اسرع' || subType === 'سرعة') {
                  boardText += `${medal} **#${index + 1}** - ${data.name} ⟵ **${data.bestTime} ثانية** (${data.speedWins} فوز)\n`;
              } else if (subType === 'ت' || subType === 'تفاعل') {
                  boardText += `${medal} **#${index + 1}** - ${data.name} ⟵ **${data.messagesCount} رسالة**\n`;
              } else {
                  boardText += `${medal} **#${index + 1}** - ${data.name} ⟵ **${data.points} نقطة**\n`;
              }
          });

          return message.channel.send(boardText);
      }

      if (message.content === '!العاب') {
          sendGamesMenu(message.channel);
          return;
      }

      if (message.content === '!ايقاف') {
          if (!activeGames.has(message.channel.id)) return message.reply('❌ ما فيه فعالية شغالة.');
          const gameData = activeGames.get(message.channel.id);
          if (gameData && typeof gameData.stop === 'function') gameData.stop('cancelled');
          activeGames.delete(message.channel.id);
          return message.channel.send('🛑 **تم إيقاف اللعبة بنجاح!**');
      }

      if (message.content === '!كتابة') {
          if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!');
          runJsonGame('تحدي أسرع كاتب!', 'writing', message.channel, guildId);
      }

      if (message.content.startsWith('!فكك')) {
          if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!');
          runJsonGame('لعبة فكك!', 'scramble', message.channel, guildId);
      }

      if (message.content.startsWith('!رياضيات')) {
          if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!');
          runJsonGame('تحدي الحساب السريع!', 'math', message.channel, guildId);
      }

      if (message.content.startsWith('!قسمة') || message.content.startsWith('!ضرب')) {
          if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!');
          runJsonGame('تحدي الضرب!', 'mul', message.channel, guildId);
      }

      if (message.content.startsWith('!عواصم')) {
          if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!');
          runJsonGame('لعبة العواصم!', 'capital', message.channel, guildId);
      }
  }
});

client.login(DISCORD_TOKEN);
