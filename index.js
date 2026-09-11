const { Client, GatewayIntentBits, ActivityType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');
const { MongoClient } = require('mongodb');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const mongoUri = process.env.MONGO_URI;

// اتصال قاعدة البيانات السحابية الآمنة
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

// ==========================================
// 💰 سوق العقارات والبورصة
// ==========================================
let marketItems = [
    { id: 1, name: 'بسطة شاي جمر', type: 'مشروع صغير', basePrice: 2000, price: 2000, profit: 200, emoji: '☕' },
    { id: 2, name: 'ورشة سيارات', type: 'صيانة', basePrice: 15000, price: 15000, profit: 1200, emoji: '🔧' },
    { id: 3, name: 'شقة مفروشة بالرياض', type: 'عقار', basePrice: 45000, price: 45000, profit: 4500, emoji: '🏢' },
    { id: 4, name: 'تسالي', type: 'مطعم', basePrice: 85000, price: 85000, profit: 8000, emoji: '🍔' },
    { id: 5, name: 'استراحة بالمجمعة', type: 'عقار', basePrice: 120000, price: 120000, profit: 12000, emoji: '🏡' },
    { id: 6, name: 'معرض سيارات فخمة', type: 'معرض', basePrice: 350000, price: 350000, profit: 35000, emoji: '🏎️' },
    { id: 7, name: 'برج تجاري ضخم', type: 'عقار', basePrice: 1000000, price: 1000000, profit: 100000, emoji: '🏙️' },
    { id: 8, name: 'بوفية ليالي الشرقية', type: 'مشروع صغير', basePrice: 5000, price: 5000, profit: 550, emoji: '☕' },
    { id: 9, name: 'بوفية السعادة', type: 'مشروع صغير', basePrice: 3500, price: 3500, profit: 450, emoji: '☕' },
    { id: 10, name: 'شقة مفروشة بالثقبه', type: 'مشروع صغير', basePrice: 2500, price: 2500, profit: 200, emoji: '🏡' }
];

// تحديث أسعار السوق والأرباح عشوائياً كل 5 دقائق
setInterval(() => {
    marketItems.forEach(item => {
        const fluctuation = (Math.random() * 0.30) - 0.15;
        item.price = Math.floor(item.basePrice * (1 + fluctuation));
        item.profit = Math.floor(item.price * 0.10);
    });
    console.log('[MARKET] تم تحديث أسعار السوق والأرباح المباشرة!');
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
    channel.send(`⭐ **${userTag}** كسب **10 نقاط**! (رصيده: ${doc.points} نقطة)`);
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
🏆 **لوحة الصدارة:** \`!ت ن\` (نقاط) | \`!ت س\` (سرعة)
🛑 \`!ايقاف\` : لإلغاء اللعبة الحالية
    `;
    channel.send(menu);
}

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  const guildId = message.guild.id;

  // 🏢 قسم الاقتصاد والعقارات
  if (allowedEconomyChannels.includes(message.channel.id)) {
      if (message.content === '!اقتصاد') {
          return message.channel.send(`🏦 **سوق العقارات والتحويل**\n!راتب | !بنك | !سوق | !شراء [رقم] | !بيع [رقم] | !املاكي | !ارباح | !تحويل [@الشخص] [المبلغ]`);
      }
      if (message.content === '!بنك') {
          const user = await getEconomyUser(guildId, message.author.id);
          return message.reply(`💳 رصيدك الكاش: **$${user.balance.toLocaleString()}**`);
      }
      if (message.content === '!راتب') {
          let user = await getEconomyUser(guildId, message.author.id);
          const now = Date.now();
          const cooldown = 5 * 60 * 1000; 
          if (now - user.lastWork < cooldown) {
              const m = Math.ceil((cooldown - (now - user.lastWork)) / 60000);
              return message.reply(`⏳ باقي لك **${m} دقيقة** على الراتب!`);
          }
          const salary = Math.floor(Math.random() * 800) + 700;
          user.balance += salary; user.lastWork = now;
          await saveEconomyUser(guildId, message.author.id, user);
          return message.reply(`💵 نزل راتبك: **$${salary}**! رصيدك: **$${user.balance.toLocaleString()}**`);
      }

      // عرض السوق بـ Embed فخم ومنظم
      if (message.content === '!سوق') {
          const embed = new EmbedBuilder()
              .setColor('#0099ff')
              .setTitle('📈 بورصة العقارات والمشاريع المباشرة')
              .setDescription('*(تتحدث الأسعار والأرباح تلقائياً كل 5 دقائق بناءً على حركة السوق)*');

          marketItems.forEach(i => {
              embed.addFields({
                  name: `[${i.id}] ${i.emoji} ${i.name}`,
                  value: `🏷️ النوع: \`${i.type}\`\n💰 السعر: **$${i.price.toLocaleString()}** | 💸 الأرباح: **$${i.profit.toLocaleString()}**`,
                  inline: false
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
          return message.reply(`🎉 مبروك شريت **${item.name}**!`);
      }
      if (message.content === '!املاكي') {
          const user = await getEconomyUser(guildId, message.author.id);
          if (user.properties.length === 0) return message.reply('مفلس! ما عندك عقارات.');
          let txt = `🏠 **أملاكك:**\n\n`; let totalV = 0, totalP = 0;
          user.properties.forEach((pid, idx) => {
              const item = marketItems.find(i => i.id === pid);
              if (item) {
                  txt += `> ${idx+1}. ${item.emoji} ${item.name} (أرباحه: $${item.profit.toLocaleString()})\n`;
                  totalV += item.price; totalP += item.profit;
              }
          });
          txt += `\n📈 إجمالي الأرباح المتوقعة: $${totalP.toLocaleString()} | القيمة السوقية: $${totalV.toLocaleString()}`;
          return message.channel.send(txt);
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
          if (user.properties.length === 0) return message.reply('❌ ما عندك عقارات تجيب أرباح.');
          const now = Date.now();
          const profitCooldown = 5 * 60 * 1000;
          if (now - user.lastProfit < profitCooldown) {
              const m = Math.ceil((profitCooldown - (now - user.lastProfit)) / 60000);
              return message.reply(`⏳ باقي لك **${m} دقيقة** لاستلام الأرباح القادمة!`);
          }
          let total = 0; 
          user.properties.forEach(pid => { 
              const i = marketItems.find(x => x.id === pid); 
              if (i) total += i.profit; 
          });
          user.balance += total; 
          user.lastProfit = now;
          await saveEconomyUser(guildId, message.author.id, user);
          return message.reply(`📈 استلمت أرباح ممتلكاتك: **$${total.toLocaleString()}**!`);
      }
      if (message.content.startsWith('!تحويل')) {
          const args = message.content.split(' ');
          const target = message.mentions.users.first();
          const amt = parseInt(args[2]);
          if (!target || isNaN(amt) || amt <= 0) return message.reply('❌ الاستخدام: `!تحويل @الشخص المبلغ`');
          if (target.id === message.author.id) return message.reply('😅 ما تحول لنفسك!');
          let s = await getEconomyUser(guildId, message.author.id);
          if (s.balance < amt) return message.reply('💸 رصيدك ما يكفي!');
          s.balance -= amt;
          await saveEconomyUser(guildId, message.author.id, s);
          let r = await getEconomyUser(guildId, target.id);
          r.balance += amt;
          await saveEconomyUser(guildId, target.id, r);
          return message.channel.send(`✅ تم تحويل **$${amt.toLocaleString()}** إلى ${target}.`);
      }
  }

  // 🎮 قسم الألعاب
  if (allowedChannels.includes(message.channel.id)) {
      trackUserMessage(guildId, message.author.id, message.author.displayName);

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

          coll.on('end', (c, r) => {
              if (r === 'time') {
                  activeGames.delete(message.channel.id);
                  message.channel.send(`⏰ انتهى وقت لعبة XO.`);
                  sendGamesMenu(message.channel);
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
              else { message.channel.send(`😅 المسدس فاضي! كسبت نقاط.`); addPoints(guildId, message.author.id, message.author.displayName, message.channel); }
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
                  await i.update({ content: `🎉 فكيت القنبلة وكسبت نقاط!`, components: [] });
                  addPoints(guildId, message.author.id, message.author.displayName, message.channel);
              } else { await i.update({ content: `💥 بوووم وانفجرت القنبلة 💀`, components: [] }); }
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
                  await i.update({ content: `🏆 كفو ${i.user}! في **${t} ثانية**!`, components: [] });
                  addPoints(guildId, i.user.id, i.user.displayName, message.channel, parseFloat(t));
                  sendGamesMenu(message.channel);
              });
          }, 2000);
      }

      if (message.content.startsWith('!ت')) {
          if (!pointsColl) return message.reply('🏆 قاعدة البيانات غير متصلة.');
          let u = await pointsColl.find({ guildId }).sort({ points: -1 }).limit(5).toArray();
          if (u.length === 0) return message.reply('🏆 ما فيه بيانات مسجلة.');
          let txt = `🏆 **أعلى النقاط:**\n\n`;
          u.forEach((d, i) => {
              let medal = i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏅';
              txt += `${medal} **#${i + 1}** - ${d.name} ⟵ **${d.points} نقطة**\n`;
          });
          return message.channel.send(txt);
      }
  }
});

client.login(DISCORD_TOKEN);
