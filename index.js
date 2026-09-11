const { Client, GatewayIntentBits, ActivityType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// إعدادات البيئة الآمنة (يتم جلبها تلقائياً من إعدادات المستضيف السحابي)
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

const pointsFilePath = path.join(__dirname, 'points.json');

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
        pointsData[guildId][userId] = { 
            name: userTag, 
            points: 0,
            speedWins: 0,
            bestTime: 999999,
            messagesCount: 0
        };
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
        pointsData[guildId][userId] = { 
            name: userTag, 
            points: 0,
            speedWins: 0,
            bestTime: 999999,
            messagesCount: 0
        };
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
            console.log(`❌ Error: Please provide a valid User ID. Example: reset 123456789`);
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
    else if (cmd !== '') {
        console.log(`❌ Unknown command. Type 'help' for available commands.`);
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

// دالة توليد الأسئلة بـ Gemini مع تفعيل أقصى درجة عشوائية لمنع التكرار نهائياً
async function generateAIQuestion(type) {
    try {
        const randomSeed = Math.floor(Math.random() * 1000000);
        let prompt = "";
        
        if (type === 'writing') {
            prompt = `معرف عشوائي ${randomSeed}: اعطني جملة عربية حماسية ومبتكرة جداً للقيمرز تحدي سرعة كتابة. ارجع الجملة فقط بدون مقدمات او تنصيص.`;
        } else if (type === 'scramble') {
            prompt = `معرف عشوائي ${randomSeed}: اختر كلمة عربية فريدة تماماً من 4 إلى 6 أحرف. ارجع الكلمة فقط بدون شرح.`;
        } else if (type === 'math') {
            const n1 = Math.floor(Math.random() * 90) + 10;
            const n2 = Math.floor(Math.random() * 60) + 10;
            return { display: `كم ناتج: ${n1} + ${n2} ؟`, answer: (n1 + n2).toString() };
        } else if (type === 'mul') {
            const n1 = Math.floor(Math.random() * 12) + 4;
            const n2 = Math.floor(Math.random() * 12) + 4;
            return { display: `كم ناتج: ${n1} × ${n2} ؟`, answer: (n1 * n2).toString() };
        } else if (type === 'capital') {
            prompt = `معرف عشوائي ${randomSeed}: اختر دولة وعاصمتها غير مكررة ومنوعة عالمياً، ونسق الإجابة بهذا الشكل تماماً: الدولة|العاصمة. مثال: كندا|اوتاوا. لا تكتب أي شي غيرها.`;
        }

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                temperature: 1.0, // أقصى درجة عشوائية لضمان عدم تكرار الأسئلة
            }
        });

        const text = response.text ? response.text.trim() : "";

        if (type === 'writing') {
            return { display: `عندكم **30 ثانية** لكتابة الجملة التالية:\n\n\`${text}\``, answer: text };
        } else if (type === 'scramble') {
            const cleanWord = text.replace(/[^أ-ي]/g, '');
            const scrambled = cleanWord.split('').sort(() => 0.5 - Math.random()).join(' ');
            return { display: `رتب الحروف لتكون كلمة صحيحة:\n\n\`${scrambled}\``, answer: cleanWord };
        } else if (type === 'capital') {
            const parts = text.split('|');
            if (parts.length === 2) {
                return { display: `ما هي عاصمة **${parts[0].trim()}** ؟`, answer: parts[1].trim() };
            }
            return { display: `ما هي عاصمة **أستراليا** ؟`, answer: 'كانبيرا' };
        }
    } catch (e) {
        if (type === 'writing') return { display: `عندكم **30 ثانية** لكتابة:\n\n\`العب بكل قوة وحقق الانتصار\``, answer: 'العب بكل قوة وحقق الانتصار' };
        if (type === 'scramble') return { display: `رتب الحروف: \`م س ج ل\``, answer: 'مسجل' };
        if (type === 'capital') return { display: `ما هي عاصمة **إيطاليا** ؟`, answer: 'روما' };
    }
}

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!allowedChannels.includes(message.channel.id)) return;

  const guildId = message.guild.id;
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

  async function runQuickGameByAI(gameTitle, aiType, channel) {
      const loadingMsg = await channel.send(`⏳ جاري توليد سؤال جديد بالذكاء الاصطناعي...`);
      const gameData = await generateAIQuestion(aiType);
      
      if (!gameData) {
          await loadingMsg.edit(`❌ حدث خطأ أثناء جلب السؤال، حاول مرة أخرى.`);
          return;
      }

      await loadingMsg.edit(`🎮 **${gameTitle}**\n${gameData.display}`);
      const startTime = Date.now();

      const filter = m => !m.author.bot;
      const collector = channel.createMessageCollector({ filter, time: 30000 });
      activeGames.set(channel.id, collector);

      let answeredCorrectly = false;
      collector.on('collect', m => {
          if (m.content.trim().toLowerCase() === gameData.answer.toLowerCase()) {
              answeredCorrectly = true;
              const endTime = Date.now();
              const timeElapsed = ((endTime - startTime) / 1000).toFixed(2);

              m.react('🎉');
              channel.send(`🎉 فاز ${m.author} بزمن خيالي: **${timeElapsed} ثانية**! الإجابة صحيحة: **${gameData.answer}**`);
              addPoints(guildId, m.author.id, m.author.displayName, channel, parseFloat(timeElapsed));
              collector.stop('correct');
          } else {
              m.react('❌');
          }
      });

      collector.on('end', (collected, reason) => {
          if (reason === 'cancelled') return;
          activeGames.delete(channel.id);
          if (!answeredCorrectly) channel.send(`⏰ خلص الوقت! الإجابة الصحيحة كانت: **${gameData.answer}**`);
          sendGamesMenu(channel);
      });
  }

  if (message.content === '!كتابة') {
      if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!');
      runQuickGameByAI('تحدي أسرع كاتب!', 'writing', message.channel);
  }

  if (message.content.startsWith('!فكك')) {
      if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!');
      runQuickGameByAI('لعبة فكك!', 'scramble', message.channel);
  }

  if (message.content.startsWith('!رياضيات')) {
      if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!');
      runQuickGameByAI('تحدي الحساب السريع!', 'math', message.channel);
  }

  if (message.content.startsWith('!قسمة') || message.content.startsWith('!ضرب')) {
      if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!');
      runQuickGameByAI('تحدي الضرب!', 'mul', message.channel);
  }

  if (message.content.startsWith('!عواصم')) {
      if (activeGames.has(message.channel.id)) return message.reply('⏳ انتظر!');
      runQuickGameByAI('لعبة العواصم!', 'capital', message.channel);
  }

});

// تسجيل الدخول الآمن
client.login(DISCORD_TOKEN);
