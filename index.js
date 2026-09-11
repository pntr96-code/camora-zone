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

  // مؤقت منفصل للعبة القنبلة (كل 5 دقائق)
  setInterval(() => {
      allowedChannels.forEach(async channelId => {
          const channel = client.channels.cache.get(channelId);
          if (channel && !activeGames.has(channelId)) {
              startBombGameAutomatically(channel);
          }
      });
  }, 5 * 60 * 1000);

  // مؤقت منفصل للعبة فكك (كل 10 دقائق)
  setInterval(() => {
      allowedChannels.forEach(async channelId => {
          const channel = client.channels.cache.get(channelId);
          if (channel && !activeGames.has(channelId)) {
              startScrambleGameAutomatically(channel, channel.guild.id);
          }
      });
  }, 10 * 60 * 1000);
});

function sendGamesMenu(channel) {
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🎮 قائمة ألعاب وقوائم 𝐂𝐚𝐦𝐨𝐫𝐚 𝐙𝐨𝐧𝐞')
        .addFields(
            { name: '🔪 الألعاب والفعاليات', value: '`!القاتل` | `!xo` | `!روليت` | `!قنبلة` (تلقائي 5د) | `!فكك` (تلقائي 10د) | `!زر` | `!كتابة` | `!فعالية` (عشوائي بدون تايمر)', inline: false },
            { name: '🏆 لوحة الصدارة', value: '`!ت ن` (نقاط) | `!ت س` (سرعة) | `!ت ت` (تفاعل)', inline: false }
        )
        .setFooter({ text: '🛑 لإلغاء أي لعبة جارية اكتب: !ايقاف' });
    channel.send({ embeds: [embed] });
}

async function startBombGameAutomatically(channel) {
    activeGames.set(channel.id, 'bomb');
    const wires = [
        { id: 'r', label: 'أحمر 🔴', style: ButtonStyle.Danger },
        { id: 'b', label: 'أزرق 🔵', style: ButtonStyle.Primary },
        { id: 'g', label: 'أخضر 🟢', style: ButtonStyle.Success }
    ].sort(() => Math.random() - 0.5);
    const safe = wires[0].id;
    const row = new ActionRowBuilder();
    wires.forEach(w => row.addComponents(new ButtonBuilder().setCustomId(w.id).setLabel(w.label).setStyle(w.style)));
    
    const msg = await channel.send({ content: `🚨 **[تحدي تلقائي]** قنبلة زرعت! اختر السلك الصحيح خلال 15 ثانية:`, components: [row] });
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
    coll.on('end', (c, r) => {
        if (r === 'time') {
            activeGames.delete(channel.id);
            msg.edit({ content: `⏰ انتهى الوقت وانفجرت القنبلة!`, components: [] }).catch(()=>{});
        }
    });
}

async function startScrambleGameAutomatically(channel, guildId) {
    const words = ['برمجة', 'ديسكورد', 'حاسب', 'مهندس', 'تطوير', 'تقنية', 'سيرفر', 'ذكاء'];
    const word = words[Math.floor(Math.random() * words.length)];
    const scrambled = word.split('').sort(() => 0.5 - Math.random()).join(' ');

    const msg = await channel.send(`🧩 **[تحدي تلقائي]** رتب الحروف التالية:\n\n\`${scrambled}\``);
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

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            activeGames.delete(channel.id);
            channel.send(`⏰ انتهى الوقت! الكلمة كانت: **${word}**`);
        }
    });
}

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  const guildId = message.guild.id;

  // 🏢 قسم الاقتصاد والعقارات (فقط في روم الاقتصاد)
  if (allowedEconomyChannels.includes(message.channel.id)) {
      if (message.content === '!اقتصاد') {
          const embed = new EmbedBuilder()
              .setColor('#2ecc71')
              .setTitle('🏦 النظام الاقتصادي وسوق العقارات')
              .setDescription('أوامر إدارة الأموال، الاستثمار، والتحويل:')
              .addFields(
                  { name: '💵 الأوامر الأساسية', value: '`!راتب` (كل 5د) | `!بنك` (معرفة الرصيد)', inline: false },
                  { name: '📈 السوق والأملاك', value: '`!سوق` (عرض البورصة) | `!املاكي` (محفظتك) | `!ارباح` (استلام الأرباح كل 5د)', inline: false },
                  { name: '🛒 البيع والشراء', value: '`!شراء [رقم]` | `!بيع [رقم]`', inline: false },
                  { name: '🤝 التحويل', value: '`!تحويل [@الشخص] [المبلغ]`', inline: false }
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
          const embed = new EmbedBuilder()
              .setColor('#0099ff')
              .setTitle('📈 بورصة العقارات والمشاريع المباشرة')
              .setDescription('*(تتحدث الأسعار والأرباح تلقائياً كل 5 دقائق)*');

          marketItems.forEach(i => {
              embed.addFields({
                  name: `[${i.id}] ${i.emoji} ${i.name}`,
                  value: `🏷️ \`${i.type}\`\n💰 **$${i.price.toLocaleString()}** | 💸 ربح: **$${i.profit.toLocaleString()}**`,
                  inline: true
              });
          });

          embed.setFooter({ text: '💡 لشراء عقار اكتب: !شراء [رقم العقار] (مثال: !شراء 1)' });
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
          return message.reply(`🎉 مبروك شريت **${item.name}** بسعر **$${item.price.toLocaleString()}**! رصيدك: **$${user.balance.toLocaleString()}**`);
      }

      if (message.content === '!املاكي') {
          const user = await getEconomyUser(guildId, message.author.id);
          if (user.properties.length === 0) return message.reply('مفلس! ما عندك عقارات.');
          const embed = new EmbedBuilder().setColor('#00FF00').setTitle(`🏠 محفظة الاستثمار لـ ${message.author.displayName}`);
          let totalV = 0, totalP = 0;
          user.properties.forEach((pid, idx) => {
              const item = marketItems.find(i => i.id === pid);
              if (item) {
                  embed.addFields({ name: `${idx+1}. ${item.emoji} ${item.name}`, value: `💸 أرباحه: $${item.profit.toLocaleString()} | القيمة: $${item.price.toLocaleString()}`, inline: false });
                  totalV += item.price; totalP += item.profit;
              }
          });
          embed.setDescription(`📈 إجمالي الأرباح (كل 5د): **$${totalP.toLocaleString()}**\n💰 إجمالي القيمة: **$${totalV.toLocaleString()}**`);
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
              return message.reply(`⏳ باقي لك **${m} دقيقة** على الأرباح القادمة!`);
          }
          let total = 0; 
          user.properties.forEach(pid => { const i = marketItems.find(x => x.id === pid); if (i) total += i.profit; });
          user.balance += total; user.lastProfit = now;
          await saveEconomyUser(guildId, message.author.id, user);
          return message.reply(`📈 استلمت أرباح ممتلكاتك: **$${total.toLocaleString()}**! رصيدك: **$${user.balance.toLocaleString()}**`);
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

  // 🎮 قسم الألعاب (فقط في رومات الألعاب)
  if (allowedChannels.includes(message.channel.id)) {
      trackUserMessage(guildId, message.author.id, message.author.displayName);

      // أمر عشوائي بدون تايمر (يضم كل الألعاب ما عدا XO والقاتل)
      if (message.content === '!فعالية' || message.content === '!لعبة') {
          if (activeGames.has(message.channel.id)) return message.reply('⏳ فيه لعبة شغالة!');
          const randType = Math.floor(Math.random() * 3);
          
          if (randType === 0) {
              // روليت
              activeGames.set(message.channel.id, 'roulette');
              message.channel.send(`🎲 **[لعبة عشوائية] روليت الحظ** - ${message.author} سحب الزناد...`);
              setTimeout(() => {
                  activeGames.delete(message.channel.id);
                  if (Math.floor(Math.random() * 6) + 1 === 1) {
                      message.channel.send(`💥 **بووووم!** ${message.author} خسر الروليت 💀.`);
                  } else {
                      message.channel.send(`😅 المسدس فاضي! كسبت **10 نقاط** يا ${message.author}.`);
                      addPoints(guildId, message.author.id, message.author.displayName, message.channel);
                  }
              }, 2000);
          } else if (randType === 1) {
              // زر سريع
              activeGames.set(message.channel.id, 'button');
              const msg = await message.channel.send(`⚡ **[لعبة عشوائية]** استعد لسرعة الضغط...`);
              setTimeout(async () => {
                  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('fc').setLabel('⚡ اضغطني!').setStyle(ButtonStyle.Success));
                  await msg.edit({ content: `🔥 **أسرع ضغطة!**`, components: [row] });
                  const start = Date.now();
                  const coll = msg.createMessageComponentCollector({ time: 10000, max: 1 });
                  coll.on('collect', async i => {
                      activeGames.delete(message.channel.id);
                      const t = ((Date.now() - start) / 1000).toFixed(2);
                      await i.update({ content: `🏆 كفو ${i.user}! في **${t} ثانية** وكسبت **10 نقاط**!`, components: [] });
                      addPoints(guildId, i.user.id, i.user.displayName, message.channel, parseFloat(t));
                  });
              }, 1500);
          } else {
              // كتابة سريعة
              activeGames.set(message.channel.id, 'writing');
              const sentence = 'تحدي السرعة في كتابة الجملة';
              const msg = await message.channel.send(`⌨️ **[لعبة عشوائية] أسرع كاتب!** اكتب الجملة التالية:\n\n\`${sentence}\``);
              const start = Date.now();
              const filter = m => !m.author.bot && m.content.trim() === sentence;
              const coll = message.channel.createMessageCollector({ filter, time: 20000, max: 1 });
              coll.on('collect', m => {
                  activeGames.delete(message.channel.id);
                  const t = ((Date.now() - start) / 1000).toFixed(2);
                  m.react('🎉');
                  m.reply(`🎉 كفو ${m.author}! كتبت بـ **${t} ثانية** وكسبت **10 نقاط**!`);
                  addPoints(guildId, m.author.id, m.author.displayName, message.channel, parseFloat(t));
              });
              coll.on('end', (_, r) => {
                  if (r === 'time') {
                      activeGames.delete(message.channel.id);
                      message.channel.send(`⏰ انتهى وقت التحدي العشوائي!`);
                  }
              });
          }
          return;
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
          if (activeGames.has(message.channel.id)) return message.reply('⏳ فيه لعبة شغالة!');
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

          const gameMsg = await message.channel.send({
              content: `🎮 **تحدي XO**\nدور اللاعب: <@${turn}>`,
              components: getRows(board)
          });

          const coll = gameMsg.createMessageComponentCollector({ time: 60000 });
          coll.on('collect', async i => {
              if (i.user.id !== turn) return i.reply({ content: '❌ مو دورك!', ephemeral: true });
              const idx = parseInt(i.customId.split('_')[1]);
              board[idx] = (turn === playerX) ? 'X' : 'O';
              let winner = checkWin(board);

              if (winner) {
                  coll.stop(); activeGames.delete(message.channel.id);
                  if (winner === 'tie') {
                      await i.update({ content: `🤝 **تعادلنا!**`, components: getRows(board) });
                  } else {
                      let wUser = (winner === 'X') ? message.author : (playerO === client.user.id ? client.user : opponent);
                      await i.update({ content: `🎉 **مبروك الفوز!** <@${wUser.id || wUser}>`, components: getRows(board) });
                      if (wUser.id !== client.user.id) addPoints(guildId, wUser.id || wUser, wUser.displayName || 'لاعب', message.channel);
                  }
                  return sendGamesMenu(message.channel);
              }

              turn = (turn === playerX) ? playerO : playerX;
              await i.update({ content: `🎮 **تحدي XO**\nدور اللاعب: <@${turn}>`, components: getRows(board) });

              if (playerO === client.user.id && turn === client.user.id) {
                  setTimeout(async () => {
                      let empty = board.map((v, idx) => v === null ? idx : null).filter(v => v !== null);
                      if (empty.length === 0) return;
                      board[empty[Math.floor(Math.random() * empty.length)]] = 'O';
                      winner = checkWin(board);
                      if (winner) {
                          coll.stop(); activeGames.delete(message.channel.id);
                          await gameMsg.edit({ content: `🤖 **فاز البوت!**`, components: getRows(board) });
                          return sendGamesMenu(message.channel);
                      }
                      turn = playerX;
                      await gameMsg.edit({ content: `🎮 **تحدي XO**\nدور اللاعب: <@${turn}>`, components: getRows(board) });
                  }, 800);
              }
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

      if (message.content === '!قنبلة') {
          if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!');
          activeGames.set(message.channel.id, 'bomb');
          const wires = [
              { id: 'r', label: 'أحمر 🔴', style: ButtonStyle.Danger },
              { id: 'b', label: 'أزرق 🔵', style: ButtonStyle.Primary },
              { id: 'g', label: 'أخضر 🟢', style: ButtonStyle.Success }
          ].sort(() => Math.random() - 0.5);
          const safe = wires[0].id;
          const row = new ActionRowBuilder();
          wires.forEach(w => row.addComponents(new ButtonBuilder().setCustomId(w.id).setLabel(w.label).setStyle(w.style)));
          const msg = await message.channel.send({ content: `💣 **اختر السلك الصح:**`, components: [row] });
          const coll = msg.createMessageComponentCollector({ filter: i => i.user.id === message.author.id, time: 15000, max: 1 });
          coll.on('collect', async i => {
              activeGames.delete(message.channel.id);
              if (i.customId === safe) {
                  await i.update({ content: `🎉 **كفوو!** فكيت القنبلة وكسبت **10 نقاط** يا ${i.user}! 💣`, components: [] });
                  addPoints(guildId, message.author.id, message.author.displayName, message.channel);
              } else { 
                  await i.update({ content: `💥 بوووم وانفجرت القنبلة 💀`, components: [] }); 
              }
              sendGamesMenu(message.channel);
          });
      }

      if (message.content === '!زر') {
          if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!');
          activeGames.set(message.channel.id, 'button');
          const msg = await message.channel.send(`⏳ استعد...`);
          setTimeout(async () => {
              if (!activeGames.has(message.channel.id)) return;
              const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('fc').setLabel('⚡ اضغطني!').setStyle(ButtonStyle.Success));
              await msg.edit({ content: `🔥 **أسرع ضغطة!**`, components: [row] });
              const start = Date.now();
              const coll = msg.createMessageComponentCollector({ time: 10000, max: 1 });
              coll.on('collect', async i => {
                  activeGames.delete(message.channel.id);
                  const t = ((Date.now() - start) / 1000).toFixed(2);
                  await i.update({ content: `🏆 كفو ${i.user}! في **${t} ثانية** وكسبت **10 نقاط**!`, components: [] });
                  addPoints(guildId, i.user.id, i.user.displayName, message.channel, parseFloat(t));
                  sendGamesMenu(message.channel);
              });
          }, 2000);
      }

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
              embed.addFields({
                  name: `${medal} المركز #${i + 1} - ${d.name}`,
                  value: `⭐ النتيجة: **${val}**`,
                  inline: false
              });
          });

          return message.channel.send({ embeds: [embed] });
      }
  }
});

client.login(DISCORD_TOKEN);
