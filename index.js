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
const allowedChannels = ['1547728033580847236', '1547728346081927262']; 
const allowedEconomyChannels = ['1547951432186077296']; 

const pointsFilePath = path.join(__dirname, 'points.json');
const wordsFilePath = path.join(__dirname, 'words.json');
const economyFilePath = path.join(__dirname, 'economy.json');

// ==========================================
// 💰 دوال النظام الاقتصادي (السوق والبورصة)
// ==========================================
let marketItems = [
    { id: 1, name: 'بسطة شاي جمر', type: 'مشروع صغير', basePrice: 2000, price: 2000, profit: 200, emoji: '☕' },
    { id: 2, name: 'ورشة سيارات', type: 'صيانة', basePrice: 15000, price: 15000, profit: 1200, emoji: '🔧' },
    { id: 3, name: 'شقة مفروشة بالرياض', type: 'عقار', basePrice: 45000, price: 45000, profit: 4500, emoji: '🏢' },
    { id: 4, name: 'تسالي', type: 'مطعم', basePrice: 85000, price: 85000, profit: 8000, emoji: '🍔' },
    { id: 5, name: 'استراحة بالمجمعة', type: 'عقار', basePrice: 120000, price: 120000, profit: 12000, emoji: '🏡' },
    { id: 6, name: 'معرض سيارات فخمة', type: 'معرض', basePrice: 350000, price: 350000, profit: 35000, emoji: '🏎️' },
    { id: 7, name: 'برج تجاري ضخم', type: 'عقار', basePrice: 1000000, price: 1000000, profit: 100000, emoji: '🏙️' },
    { id: 8, name: 'بوفية ليالي الشرقية', type: 'مشروع صغير', basePrice: 5000, price: 2000, profit: 550, emoji: '☕' },
     { id: 9, name: 'بوفية السعادة', type: 'مشروع صغير', basePrice: 3500, price: 2000, profit: 450, emoji: '☕' },
    { id: 10, name: 'شقة مفروشة بالثقبه', type: 'مشروع صغير', basePrice: 2500, price: 2000, profit: 200, emoji: '🏡' }
];

setInterval(() => {
    marketItems.forEach(item => {
        const fluctuation = (Math.random() * 0.30) - 0.15;
        item.price = Math.floor(item.basePrice * (1 + fluctuation));
        item.profit = Math.floor(item.price * 0.10);
    });
    console.log('[MARKET] تم تحديث أسعار السوق المباشرة!');
}, 5 * 60 * 1000);

function loadEconomy() {
    if (fs.existsSync(economyFilePath)) {
        try { return JSON.parse(fs.readFileSync(economyFilePath, 'utf8')); } catch (e) { return {}; }
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
        data[guildId][userId] = { balance: 1500, properties: [], lastWork: 0, lastProfit: 0 };
    }
    return { data, user: data[guildId][userId] };
}

// ==========================================
// 🎮 دوال الألعاب والنقاط
// ==========================================
function loadWords() {
    if (fs.existsSync(wordsFilePath)) {
        try { return JSON.parse(fs.readFileSync(wordsFilePath, 'utf8')); } catch (e) { return null; }
    }
    return null;
}
const wordsData = loadWords() || { writing: ["تحدي السرعة"], scramble: ["برمجة"], capitals: [{ c: "السعودية", cap: "الرياض" }] };

let activeWritingPool = []; let activeScramblePool = []; let activeCapitalsPool = [];

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
        try { return JSON.parse(fs.readFileSync(pointsFilePath, 'utf8')); } catch (e) { return {}; }
    }
    return {};
}

function savePoints(pointsData) { fs.writeFileSync(pointsFilePath, JSON.stringify(pointsData, null, 2), 'utf8'); }

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
        if (timeElapsed < userData.bestTime) userData.bestTime = timeElapsed;
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

client.once('clientReady', () => {
  console.log(`========================================`);
  console.log(`[BOT STATUS] Camora Zone is Online! 🎮`);
  console.log(`========================================`);
  client.user.setActivity('𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞', { type: ActivityType.Playing });
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

// ==========================================
// استقبال الرسائل والأوامر
// ==========================================
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  const guildId = message.guild.id;

  // 🏢 قسم الاقتصاد والعقارات 
  if (allowedEconomyChannels.includes(message.channel.id)) {
      if (message.content === '!اقتصاد') {
          const menu = `
🏦 **النظام الاقتصادي وسوق العقارات** 🏦
-----------------------------------------
💵 \`!راتب\` : استلم راتبك (كل 5 دقائق)
💳 \`!بنك\` : لمعرفة رصيدك الكاش
🏪 \`!سوق\` : عرض الأسعار المباشرة للعقارات والشركات
🛒 \`!شراء [رقم]\` : لشراء عقار (مثال: !شراء 1)
📉 \`!بيع [رقم]\` : لبيع ممتلكاتك بسعر السوق الحالي
🏠 \`!املاكي\` : عرض ممتلكاتك الحالية
📈 \`!ارباح\` : استلام أرباح أملاكك (كل ساعة)
🤝 \`!تحويل [@الشخص] [المبلغ]\` : تحويل كاش لعضو آخر
          `;
          return message.channel.send(menu);
      }

      if (message.content === '!بنك') {
          const { user } = getEconomyUser(guildId, message.author.id);
          return message.reply(`💳 رصيدك الكاش في البنك هو: **$${user.balance.toLocaleString()}**`);
      }

      if (message.content === '!راتب') {
          let { data, user } = getEconomyUser(guildId, message.author.id);
          const now = Date.now();
          const cooldown = 5 * 60 * 1000; 
          if (now - user.lastWork < cooldown) {
              const minutesLeft = Math.ceil((cooldown - (now - user.lastWork)) / 60000);
              return message.reply(`⏳ ما تقدر تستلم الراتب الحين! باقي لك **${minutesLeft} دقيقة**.`);
          }
          const salary = Math.floor(Math.random() * 800) + 700; 
          user.balance += salary;
          user.lastWork = now;
          saveEconomy(data);
          return message.reply(`💵 نزل لك الراتب بنجاح: **$${salary}**! رصيدك صار: **$${user.balance.toLocaleString()}**`);
      }

      if (message.content === '!سوق') {
          let shopMenu = `📈 **سوق الأسهم والعقارات المباشر** 📈\n*(مؤشر السوق يتحدث عشوائياً كل 5 دقائق)*\n\n`;
          
          marketItems.forEach(item => {
              shopMenu += `> **[${item.id}] ${item.emoji} ${item.name}**\n`;
              shopMenu += `> 🏷️ النوع: \`${item.type}\` | 💰 السعر: **$${item.price.toLocaleString()}** | 💸 الأرباح: **$${item.profit.toLocaleString()}**\n`;
              shopMenu += `> -----------------------------------\n`;
          });
          
          shopMenu += `\n💡 **لشراء أي عقار اكتب:** \`!شراء [رقم العقار]\` (مثال: \`!شراء 1\`)`;
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
          return message.reply(`🎉 مبروووك! وقعت عقد **${item.name}** وصار ملكك! رصيدك المتبقي: **$${user.balance.toLocaleString()}**`);
      }

      if (message.content === '!املاكي') {
          const { user } = getEconomyUser(guildId, message.author.id);
          if (user.properties.length === 0) return message.reply('مفلس! ما عندك أي عقارات أو مشاريع حالياً 😅.');
          
          let propsMsg = `🏠 **المحفظة الاستثمارية لـ ${message.author.displayName}:**\n\n`;
          let totalDaily = 0;
          let totalValue = 0;
          
          user.properties.forEach((propId, index) => {
              const item = marketItems.find(i => i.id === propId);
              if (item) {
                  propsMsg += `> **${index + 1}. ${item.emoji} ${item.name}**\n`;
                  propsMsg += `> 💰 القيمة السوقية: **$${item.price.toLocaleString()}** | 💸 الأرباح: **$${item.profit.toLocaleString()}**\n`;
                  propsMsg += `> -----------------------------------\n`;
                  totalDaily += item.profit;
                  totalValue += item.price;
              }
          });
          propsMsg += `\n📈 **إجمالي الأرباح المتوقعة:** $${totalDaily.toLocaleString()}\n💰 **القيمة الإجمالية لأملاكك:** $${totalValue.toLocaleString()}`;
          return message.channel.send(propsMsg);
      }

      if (message.content.startsWith('!بيع ')) {
          const itemId = parseInt(message.content.split(' ')[1]);
          let { data, user } = getEconomyUser(guildId, message.author.id);
          
          const propIndex = user.properties.indexOf(itemId);
          if (propIndex === -1) return message.reply('❌ أنت ما تملك هذا العقار عشان تبيعه!');

          const item = marketItems.find(i => i.id === itemId);
          const sellPrice = Math.floor(item.price * 0.90); 
          
          user.properties.splice(propIndex, 1);
          user.balance += sellPrice;
          saveEconomy(data);
          
          return message.reply(`🤝 تم بيع **${item.name}** بسعر السوق مقابل **$${sellPrice.toLocaleString()}**! رصيدك صار: **$${user.balance.toLocaleString()}**`);
      }

      if (message.content === '!ارباح') {
          let { data, user } = getEconomyUser(guildId, message.author.id);
          if (user.properties.length === 0) return message.reply('❌ محفظتك فاضية! روح للـ `!سوق` واستثمر فلوسك أول.');

          const now = Date.now();
          const cooldown = 60 * 60 * 1000; 
          if (now - user.lastProfit < cooldown) {
              const minutesLeft = Math.ceil((cooldown - (now - user.lastProfit)) / (60 * 1000));
              return message.reply(`⏳ باقي لك **${minutesLeft} دقيقة** عشان تقدر تجمع أرباح محفظتك مرة ثانية!`);
          }

          let totalProfit = 0;
          user.properties.forEach(propId => {
              const item = marketItems.find(i => i.id === propId);
              if (item) totalProfit += item.profit;
          });

          user.balance += totalProfit;
          user.lastProfit = now;
          saveEconomy(data);
          return message.reply(`📈 استلمت أرباح ممتلكاتك بنجاح: **$${totalProfit.toLocaleString()}**! رصيدك صار: **$${user.balance.toLocaleString()}**`);
      }

      if (message.content.startsWith('!تحويل')) {
          const args = message.content.split(' ');
          const targetUser = message.mentions.users.first();
          const amount = parseInt(args[2]);

          if (!targetUser || isNaN(amount) || amount <= 0) {
              return message.reply('❌ طريقة الاستخدام: `!تحويل @الشخص المبلغ`');
          }

          if (targetUser.id === message.author.id) return message.reply('😅 ما تقدر تحول لنفسك!');
          if (targetUser.bot) return message.reply('🤖 ما تقدر تحول لبوت!');

          let { data, user: senderUser } = getEconomyUser(guildId, message.author.id);

          if (senderUser.balance < amount) {
              return message.reply(`💸 رصيدك ما يكفي! رصيدك: **$${senderUser.balance.toLocaleString()}**`);
          }

          senderUser.balance -= amount;
          let { user: receiverUser } = getEconomyUser(guildId, targetUser.id);
          receiverUser.balance += amount;

          saveEconomy(data);
          return message.channel.send(`✅ تم تحويل **$${amount.toLocaleString()}** من ${message.author} إلى ${targetUser} 💸.`);
      }
  }

  // 🎮 قسم الألعاب العادية
  if (allowedChannels.includes(message.channel.id)) {
      trackUserMessage(guildId, message.author.id, message.author.displayName);

      async function runJsonGame(gameTitle, type, channel, guildId) {
          let display = ""; let answer = "";
          if (type === 'writing') {
              const sentence = getUniqueItem(activeWritingPool, wordsData.writing);
              display = `عندكم **30 ثانية** لكتابة الجملة التالية:\n\n\`${sentence}\``; answer = sentence;
          } else if (type === 'scramble') {
              const word = getUniqueItem(activeScramblePool, wordsData.scramble);
              const scrambled = word.split('').sort(() => 0.5 - Math.random()).join(' ');
              display = `رتب الحروف لتكون كلمة صحيحة:\n\n\`${scrambled}\``; answer = word;
          } else if (type === 'math') {
              const n1 = Math.floor(Math.random() * 80) + 15; const n2 = Math.floor(Math.random() * 50) + 10;
              display = `كم ناتج: ${n1} + ${n2} ؟`; answer = (n1 + n2).toString();
          } else if (type === 'mul') {
              const n1 = Math.floor(Math.random() * 12) + 3; const n2 = Math.floor(Math.random() * 12) + 3;
              display = `كم ناتج: ${n1} × ${n2} ؟`; answer = (n1 * n2).toString();
          } else if (type === 'capital') {
              const chosen = getUniqueItem(activeCapitalsPool, wordsData.capitals);
              display = `ما هي عاصمة **${chosen.c}** ؟`; answer = chosen.cap;
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
                  const timeElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
                  m.react('🎉');
                  channel.send(`🎉 فاز ${m.author} بزمن: **${timeElapsed} ثانية**! الإجابة صحيحة: **${answer}**`);
                  addPoints(guildId, m.author.id, m.author.displayName, channel, parseFloat(timeElapsed));
                  collector.stop('correct');
              } else { m.react('❌'); }
          });
          collector.on('end', (collected, reason) => {
              if (reason === 'cancelled') return;
              activeGames.delete(channel.id);
              if (!answeredCorrectly) channel.send(`⏰ خلص الوقت! الإجابة الصحيحة كانت: **${answer}**`);
              sendGamesMenu(channel);
          });
      }

      if (message.content === '!القاتل' || message.content === '!لعبة القاتل') {
          if (activeGames.has(message.channel.id)) return message.reply('⏳ فيه فعالية شغالة!');
          message.channel.send('🚨 **لعبة القاتل بدأت!** 🚨\nعندكم **30 ثانية** للتسجيل.. اكتب `أنا` للمشاركة!');
          const filter = m => m.content === 'أنا' && !m.author.bot;
          const collector = message.channel.createMessageCollector({ filter, time: 30000 }); 
          activeGames.set(message.channel.id, collector); 
          const players = new Map();
          collector.on('collect', m => {
              if (!players.has(m.author.id)) {
                  players.set(m.author.id, { id: m.author.id, displayName: m.author.displayName, isBot: false }); m.react('✅');
              }
          });
          collector.on('end', async (collected, reason) => {
              if (reason === 'cancelled') return; 
              let playerArray = Array.from(players.values());
              const fakeNames = ['سلطان الذكي', 'ماجد السريع', 'فهد الغامض', 'صالح المحقق', 'راشد الخبيث'];
              let fakeIndex = 0;
              while (playerArray.length < 5) {
                  playerArray.push({ id: `fake_${fakeIndex}`, displayName: `🤖 ${fakeNames[fakeIndex++]}`, isBot: true });
              }
              const killer = playerArray[Math.floor(Math.random() * playerArray.length)];
              for (const player of playerArray) {
                  if (!player.isBot) {
                      try {
                          const userObj = await client.users.fetch(player.id);
                          if (player.id === killer.id) await userObj.send('🔪 **أنت القاتل!** حاول تقنع الباقين إنك بريء.');
                          else await userObj.send('🛡️ **أنت بريء!** انتبه، القاتل بينكم.');
                      } catch (e) {}
                  }
              }
              message.channel.send(`👥 **اكتمل العدد (${playerArray.length} لاعبين)!**\n💡 **الأنوار طفت...**`);
              setTimeout(() => { 
                  if (!activeGames.has(message.channel.id)) return; 
                  const innocents = playerArray.filter(p => p.id !== killer.id);
                  const victim = innocents[Math.floor(Math.random() * innocents.length)];
                  const alivePlayers = playerArray.filter(p => p.id !== victim.id);
                  message.channel.send(`🚨 **لقينا جثة!**\nالضحية هو 💀 **${victim.displayName}**.\n\n⏳ **وقت النقاش!** عندكم **40 ثانية** تتناقشون بالشات.`);
                  setTimeout(() => { 
                      if (!activeGames.has(message.channel.id)) return; 
                      let voteMsg = "⏰ **انتهى وقت النقاش! حان وقت التصويت (25 ثانية). اكتب `صوت` ورقم اللاعب:**\n\n";
                      alivePlayers.forEach((p, index) => voteMsg += `**${index + 1}** - ${p.displayName}\n`);
                      message.channel.send(voteMsg);
                      const voteFilter = m => m.content.startsWith('صوت ') && alivePlayers.some(p => p.id === m.author.id);
                      const voteCollector = message.channel.createMessageCollector({ filter: voteFilter, time: 25000 }); 
                      activeGames.set(message.channel.id, voteCollector); 
                      const votes = new Map();
                      voteCollector.on('collect', m => {
                          const num = parseInt(m.content.split(' ')[1]);
                          if (num > 0 && num <= alivePlayers.length) { votes.set(m.author.id, alivePlayers[num - 1].id); m.react('🗳️'); }
                      });
                      voteCollector.on('end', (collected, reason) => {
                          if (reason === 'cancelled') return;
                          activeGames.delete(message.channel.id);
                          alivePlayers.forEach(p => {
                              if (p.isBot) votes.set(p.id, alivePlayers[Math.floor(Math.random() * alivePlayers.length)].id);
                          });
                          if (votes.size === 0) {
                              message.channel.send(`🤷‍♂️ محد صوت! فاز القاتل 🔪 **${killer.displayName}** وهرب!`);
                          } else {
                              const tally = {}; votes.forEach(targetId => tally[targetId] = (tally[targetId] || 0) + 1);
                              let maxVotes = 0, executedId = null;
                              for (const [id, count] of Object.entries(tally)) { if (count > maxVotes) { maxVotes = count; executedId = id; } }
                              const executedPlayer = alivePlayers.find(p => p.id === executedId);
                              if (executedId === killer.id) {
                                  message.channel.send(`🎉 **الشباب جابوه!** تم إعدام ${executedPlayer.displayName} وطلع **القاتل!** 🔪`);
                                  votes.forEach((targetId, voterId) => {
                                      if (targetId === killer.id && !voterId.startsWith('fake_')) addPoints(guildId, voterId, client.users.cache.get(voterId)?.displayName || 'لاعب', message.channel);
                                  });
                              } else {
                                  message.channel.send(`❌ **تصويت خاطئ!** تم إعدام ${executedPlayer.displayName} وطلع **بريء!** 🛡️ والقاتل كان **${killer.displayName}**!`);
                              }
                          }
                          sendGamesMenu(message.channel);
                      });
                  }, 40000); 
              }, 10000); 
          });
      }

      if (message.content.startsWith('!xo')) {
          if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر الفعالية الحالية!');
          
          const opponent = message.mentions.users.first();

          if (!opponent || opponent.id === message.author.id) {
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

          if (opponent.bot) return message.reply('🤖 ما تقدر تتحدا بوت في XO!');

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
          if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!');
          activeGames.set(message.channel.id, 'roulette');
          const bullet = Math.floor(Math.random() * 6) + 1; 
          message.channel.send(`🤠 **روليت** - ${message.author} سحب الزناد... 🎲`);
          setTimeout(() => {
              if (!activeGames.has(message.channel.id)) return; 
              activeGames.delete(message.channel.id);
              if (bullet === 1) message.channel.send(`💥 **بووووم!** ${message.author} ودع الملاعب 💀.`);
              else {
                  message.channel.send(`😅 **طـــق!** المسدس فاضي! كسب نقاط.`);
                  addPoints(guildId, message.author.id, message.author.displayName, message.channel);
              }
              sendGamesMenu(message.channel);
          }, 3000); 
      }

      if (message.content === '!قنبلة') {
          if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!');
          activeGames.set(message.channel.id, 'bomb');
          const wires = [
              { id: 'wire_red', label: 'أحمر 🔴', style: ButtonStyle.Danger },
              { id: 'wire_blue', label: 'أزرق 🔵', style: ButtonStyle.Primary },
              { id: 'wire_green', label: 'أخضر 🟢', style: ButtonStyle.Success }
          ].sort(() => Math.random() - 0.5);
          const safeWire = wires[0].id; 
          const row = new ActionRowBuilder();
          wires.forEach(w => row.addComponents(new ButtonBuilder().setCustomId(w.id).setLabel(w.label).setStyle(w.style)));
          const msg = await message.channel.send({ content: `💣 **القنبلة بتنفجر بعد 15 ثانية!** اختار السلك الصح:`, components: [row] });
          const collector = msg.createMessageComponentCollector({ filter: i => i.user.id === message.author.id, time: 15000, max: 1 });
          collector.on('collect', async i => {
              activeGames.delete(message.channel.id);
              if (i.customId === safeWire) {
                  await i.update({ content: `🎉 **كفوو!** فكيت القنبلة وكسبت نقاط!`, components: [] });
                  addPoints(guildId, message.author.id, message.author.displayName, message.channel);
              } else { await i.update({ content: `💥 **بوووووووم!** قطعت السلك الغلط 💀`, components: [] }); }
              sendGamesMenu(message.channel);
          });
          collector.on('end', (c, r) => { if (r === 'time') { activeGames.delete(message.channel.id); msg.edit({ content: `💥 انتهى الوقت وانفجرت!`, components: [] }); sendGamesMenu(message.channel); } });
      }

      if (message.content === '!زر') {
          if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!');
          activeGames.set(message.channel.id, 'button');
          const msg = await message.channel.send(`⏳ **استعد... الزر بيظهر فجأة!**`);
          setTimeout(async () => {
              if (!activeGames.has(message.channel.id)) return;
              const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('fast_click').setLabel('⚡ اضغطنييي!').setStyle(ButtonStyle.Success));
              await msg.edit({ content: `🔥 **ميين يضغط الزررررر بسرعة!**`, components: [row] });
              const startTime = Date.now();
              const collector = msg.createMessageComponentCollector({ time: 10000, max: 1 });
              collector.on('collect', async i => {
                  activeGames.delete(message.channel.id);
                  const timeElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
                  await i.update({ content: `🏆 كفو ${i.user}! ضغطت الزر في **${timeElapsed} ثانية**!`, components: [] });
                  addPoints(guildId, i.user.id, i.user.displayName, message.channel, parseFloat(timeElapsed));
                  sendGamesMenu(message.channel);
              });
              collector.on('end', (c, r) => { if (r === 'time') { activeGames.delete(message.channel.id); msg.edit({ content: `😴 محد ضغط الزر!`, components: [] }); sendGamesMenu(message.channel); } });
          }, Math.floor(Math.random() * 4000) + 2000);
      }

      if (message.content.startsWith('!ت')) {
          const pointsData = loadPoints();
          if (!pointsData[guildId] || Object.keys(pointsData[guildId]).length === 0) return message.reply('🏆 ما فيه أي بيانات مسجلة!');
          const subType = message.content.split(' ')[1] ? message.content.split(' ')[1].toLowerCase() : 'ن';
          const guildUsers = pointsData[guildId];
          let sortedUsers = []; let title = '';
          if (subType === 'س') {
              sortedUsers = Object.entries(guildUsers).filter(a => a[1].bestTime < 999999).sort((a, b) => a[1].bestTime - b[1].bestTime).slice(0, 5);
              title = '⚡ **أسرع 5 أبطال** ⚡';
          } else if (subType === 'ت') {
              sortedUsers = Object.entries(guildUsers).sort((a, b) => b[1].messagesCount - a[1].messagesCount).slice(0, 5);
              title = '🔥 **أكثر 5 متفاعلين** 🔥';
          } else {
              sortedUsers = Object.entries(guildUsers).sort((a, b) => b[1].points - a[1].points).slice(0, 5);
              title = '🏆 **أعلى 5 نقاط** 🏆';
          }
          if (sortedUsers.length === 0) return message.reply('📊 لا توجد سجلات.');
          let boardText = `${title}\n\n`;
          sortedUsers.forEach(([id, data], index) => {
              let medal = index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅';
              if (subType === 'س') boardText += `${medal} **#${index + 1}** - ${data.name} ⟵ **${data.bestTime} ثانية**\n`;
              else if (subType === 'ت') boardText += `${medal} **#${index + 1}** - ${data.name} ⟵ **${data.messagesCount} رسالة**\n`;
              else boardText += `${medal} **#${index + 1}** - ${data.name} ⟵ **${data.points} نقطة**\n`;
          });
          return message.channel.send(boardText);
      }

      if (message.content === '!العاب') return sendGamesMenu(message.channel);
      if (message.content === '!ايقاف') {
          if (!activeGames.has(message.channel.id)) return message.reply('❌ ما فيه فعالية شغالة.');
          const gameData = activeGames.get(message.channel.id);
          if (gameData && typeof gameData.stop === 'function') gameData.stop('cancelled');
          activeGames.delete(message.channel.id);
          return message.channel.send('🛑 **تم إيقاف اللعبة بنجاح!**');
      }
      if (message.content === '!كتابة') { if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!'); runJsonGame('تحدي أسرع كاتب!', 'writing', message.channel, guildId); }
      if (message.content.startsWith('!فكك')) { if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!'); runJsonGame('لعبة فكك!', 'scramble', message.channel, guildId); }
      if (message.content.startsWith('!رياضيات')) { if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!'); runJsonGame('تحدي الحساب السريع!', 'math', message.channel, guildId); }
      if (message.content.startsWith('!قسمة') || message.content.startsWith('!ضرب')) { if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!'); runJsonGame('تحدي الضرب!', 'mul', message.channel, guildId); }
      if (message.content.startsWith('!عواصم')) { if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!'); runJsonGame('لعبة العواصم!', 'capital', message.channel, guildId); }
  }
});

client.login(DISCORD_TOKEN);
