const { Client, Intents, Collection, MessageEmbed } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { SlashCommandBuilder } = require('@discordjs/builders');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const token = process.env['token'];
const keepAlive = require('./keep_alive.js');

const commands = [
  {
    name: 'blacklist',
    description: 'إضافة شخص إلى البلاك لست',
    type: 1,
    options: [
      {
        name: 'user',
        type: 6,
        description: 'حدد العضو',
        required: true,
      },
    ],
  },
  {
    name: 'unblacklist',
    description: 'ازاله الشخص من البلاك لست',
    type: 1,
    options: [
      {
        name: 'user_id',
        type: 3,
        description: 'الرجاء ادخال id الشخص',
        required: true,
      },
    ],
  },
  {
    name: 'list',
    description: 'عرض قائمة الأشخاص البلاك لست',
    type: 1,
  },
  {
    name: 'help',
    description: 'عرض قائمة المساعدة',
    type: 1,
  },
  {
    name: 'uptime',
    description: 'عرض مدة تشغيل البوت',
    type: 1,
  },
].map(command => ({
  ...command,
  toAPIApplicationCommand: () => command,
}));

const rest = new REST({ version: '9' }).setToken(token);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationGuildCommands('1127001212517101629', '1006276395921575996'),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();

const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MEMBERS,
    Intents.FLAGS.GUILD_BANS,
    Intents.FLAGS.GUILD_MESSAGES,
  ],
});

const bannedMembers = new Collection();

const db = new sqlite3.Database('bannedMembers.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to the bannedMembers database.');
  }
});

db.run('CREATE TABLE IF NOT EXISTS banned_members (user_id TEXT PRIMARY KEY)');

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.user.setActivity('/help <3', { type: 'PLAYING' });

  db.all('SELECT user_id FROM banned_members', (err, rows) => {
    if (err) {
      console.error('Error fetching banned members:', err);
    } else {
      for (const row of rows) {
        bannedMembers.set(row.user_id, true);
      }
      console.log(`Loaded ${rows.length} banned members from the database.`);
    }
  });

  const statuses = ['online', 'dnd', 'idle'];
  let currentIndex = 0;

  function updateStatus() {
    client.user.setStatus(statuses[currentIndex]);
    currentIndex = (currentIndex + 1) % statuses.length;
    setTimeout(updateStatus, 1800 * 1000); // كل نصف ساعة
  }

  updateStatus();
});

client.on('guildMemberAdd', async member => {
  if (bannedMembers.has(member.id)) {
    await member.kick('Blacklisted');
    console.log(`Kicked user ${member.user.tag} upon rejoining.`);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const { commandName, options, member } = interaction;

  // التحقق من صلاحيات المستخدم
  if (!member.permissions.has('ADMINISTRATOR')) {
    await interaction.reply('**لا تمتلك صلاحية القيام بهذا الإجراء.**');
    return;
  }

  if (commandName === 'blacklist') {
    const user = options.getUser('user');
    if (user) {
      db.run('INSERT OR REPLACE INTO banned_members (user_id) VALUES (?)', [user.id], async (err) => {
        if (err) {
          console.error('Error adding user to banned members:', err);
        } else {
          bannedMembers.set(user.id, true);
          const member = interaction.guild.members.cache.get(user.id);
          if (member) {
            await member.kick('Blacklisted');
            await interaction.reply(`**تمت إضافة ${user.tag} إلى البلاك لست وتم طرده من السيرفر.**`);
          } else {
            await interaction.reply(`**لم يتم العثور على العضو المحدد.**`);
          }
        }
      });
    }
  } else if (commandName === 'unblacklist') {
    const user_id = options.getString('user_id');
    if (user_id) {
      if (bannedMembers.has(user_id)) {
        db.run('DELETE FROM banned_members WHERE user_id = ?', [user_id], async (err) => {
          if (err) {
            console.error('Error removing user from banned members:', err);
          } else {
            bannedMembers.delete(user_id);
            await interaction.reply(`**تمت إزالة العضو ذو المعرف ${user_id} من البلاك لست ويمكنه الآن الدخول إلى السيرفر.**`);
          }
        });
      } else {
        await interaction.reply(`**العضو ذو المعرف ${user_id} غير موجود في قائمة البلاك لست.**`);
      }
    }
  } else if (commandName === 'list') {
    const bannedUserTags = bannedMembers.map((_, userId) => `<@${userId}>`).join('\n');
    if (bannedUserTags) {
      await interaction.reply(`**قائمة الأشخاص المحظورين في البلاك لست:**\n${bannedUserTags}`);
    } else {
      await interaction.reply('**لا يوجد أشخاص محظورين في البلاك لست حاليًا.**');
    }
  } else if (commandName === 'help') {
    const helpEmbed = new MessageEmbed()
      .setColor('#3498db')
      .setTitle('قائمة المساعدة')
      .setDescription('قائمة الأوامر:')
      .addField('/blacklist', 'إضافة شخص إلى البلاك لست')
      .addField('/unblacklist', 'إزالة شخص من البلاك لست')
      .addField('/list', 'عرض قائمة الأشخاص في البلاك لست')
      .addField('/uptime', 'عرض مدة تشغيل البوت')
      .addField('/help', 'عرض قائمة المساعدة')
      .addField('<3', 'شكرا لاستخدامك :heart:')
      .addField('شكرا لنفسي', 'تعبت ولله');

    await interaction.reply({ embeds: [helpEmbed] });
  } else if (commandName === 'uptime') {
    const currentTime = Date.now();
    const uptimeInSeconds = Math.floor((currentTime - client.readyTimestamp) / 1000);
    const uptimeFormatted = new Date(uptimeInSeconds * 1000).toISOString().substr(11, 8);

    await interaction.reply(`**مدة تشغيل البوت: ${uptimeFormatted}**`);
  }
});

client.login(process.env['token']);

process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('Disconnected from the bannedMembers database.');
      process.exit(0);
    }
  });
});
