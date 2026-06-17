
const fs = require('fs');
const path = require('path');
const {
  ActionRowBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  Partials,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  MessageFlags
} = require('discord.js');

const DEFAULT_CONFIG = {
  serverName: 'DESA TULUS',
  botName: 'Radio Desa',
  embedColor: '#315C45',
  animatedEmojiId: '1516424353934348299',
  publicCreatorCategoryName: '═════ ➕BUAT VOICE➕ ═════',
  publicPanelChannelName: '〢•🎛️│ Pengaturan-Voice',
  voiceSearchChannelName: '🔎 | cari-voice',
  publicCreatorChannelName: '🏡 │ Buat Rumah',
  publicRoomCategoryNames: [
    '═════ 🔊RUANG WARGA 1🔊 ═════',
    '═════ 🔊RUANG WARGA 2🔊 ═════'
  ],
  publicRoomNameFormat: '🏡 │ Rumah {username}',
  publicCategoryCapacity: 10,
  vipCreatorCategoryName: '═════ ➕BUAT VOICE➕ ═════',
  vipPanelChannelName: '〢•🎛️│ Pengaturan-Voice',
  vipCreatorChannelName: '🏯 │ Buat Villa',
  vipRoomCategoryName: '═════ 💎RUANG VIP💎 ═════',
  vipRoomNameFormat: '🏯 │ Villa {username}',
  defaultUserLimit: 0,
  deleteDelayMs: 3000,
  adminRoleIds: [],
  staffRoleIds: [],
  panelTitle: 'Panel Pengaturan Radio Desa',
  panelFooter: 'DESA TULUS • Radio Panel'
};

function loadConfig() {
  const configPath = path.join(__dirname, 'config.json');
  const examplePath = path.join(__dirname, 'config.example.json');

  for (const filePath of [configPath, examplePath]) {
    if (!fs.existsSync(filePath)) continue;

    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return { ...DEFAULT_CONFIG, ...parsed };
    } catch (error) {
      console.error(`⚠️ Gagal membaca ${path.basename(filePath)}:`, error?.message || error);
    }
  }

  console.log('ℹ️ config.json tidak ditemukan. Bot memakai default aman Railway.');
  return DEFAULT_CONFIG;
}

const config = loadConfig();
const DB_PATH = path.join(__dirname, 'db.json');

function buildSlashCommands() {
  const setupOptions = command => command
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addRoleOption(option => option.setName('juragan_role').setDescription('Role Juragan untuk akses Villa VIP').setRequired(false))
    .addRoleOption(option => option.setName('donatur_role').setDescription('Role Donatur untuk akses Villa VIP').setRequired(false))
    .addRoleOption(option => option.setName('admin_role').setDescription('Role Admin Radio Desa').setRequired(false))
    .addRoleOption(option => option.setName('co_role').setDescription('Role Co Owner DESA TULUS').setRequired(false))
    .addChannelOption(option => option.setName('log_channel').setDescription('Channel log Radio Desa').addChannelTypes(ChannelType.GuildText).setRequired(false));

  return [
    setupOptions(new SlashCommandBuilder().setName('radio-setup').setDescription('Setup lengkap Radio Desa: Rumah warga dan Villa VIP')),
    setupOptions(new SlashCommandBuilder().setName('voice-setup').setDescription('Alias lama untuk setup Radio Desa')),
    new SlashCommandBuilder().setName('radio-panel').setDescription('Kirim ulang panel Radio Desa').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder().setName('voice-panel').setDescription('Alias lama untuk panel Radio Desa').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder()
      .setName('radio-voice')
      .setDescription('Cari voice channel tempat seorang warga berada')
      .addUserOption(option => option.setName('user').setDescription('Warga yang ingin dicari').setRequired(true)),
    new SlashCommandBuilder().setName('radio-status').setDescription('Lihat status Rumah atau Villa milikmu'),
    new SlashCommandBuilder().setName('radio-help').setDescription('Lihat panduan command Radio Desa'),
    new SlashCommandBuilder().setName('radio-reset').setDescription('Reset referensi setup tanpa menghapus channel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('voice-reset').setDescription('Alias lama reset referensi setup').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  ].map(command => command.toJSON());
}

async function autoRegisterSlashCommands(readyClient) {
  if (String(process.env.AUTO_REGISTER_COMMANDS || 'true').toLowerCase() === 'false') return;

  const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
  if (!token) return;

  const appId = process.env.CLIENT_ID || readyClient.user.id;
  const guildIds = process.env.GUILD_ID
    ? [process.env.GUILD_ID]
    : readyClient.guilds.cache.map(guild => guild.id);

  if (!guildIds.length) {
    console.log('⚠️ Bot belum masuk server mana pun, command belum bisa didaftarkan otomatis.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(token);
  const commands = buildSlashCommands();

  for (const guildId of guildIds) {
    try {
      await rest.put(Routes.applicationGuildCommands(appId, guildId), { body: commands });
      console.log(`✅ Slash command aktif di guild ${guildId}`);
    } catch (error) {
      console.error(`❌ Gagal auto-register slash command untuk guild ${guildId}:`, error?.message || error);
    }
  }
}


function loadDB() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    return { guilds: {}, rooms: {} };
  }
}

let db = loadDB();

// Timer khusus penghapusan room kosong. Tidak mengubah nama, limit, owner,
// permission, permit, atau pengaturan room selama room masih dipakai.
const roomDeleteTimers = new Map();

function saveDB() {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function ensureGuildData(guildId) {
  if (!db.guilds[guildId]) {
    db.guilds[guildId] = {
      // categoryId disimpan untuk kompatibilitas versi lama.
      categoryId: null,
      creatorCategoryId: null,
      roomCategoryId: null,
      creatorChannelId: null,
      panelChannelId: null,
      logChannelId: null,
      boostOnly: true,
      juraganRoleId: null,
      donaturRoleId: null,
      adminRoleId: null,
      coRoleId: null,
      publicCreatorCategoryId: null,
      publicCreatorChannelId: null,
      publicPanelChannelId: null,
      voiceSearchChannelId: null,
      publicRoomCategoryIds: [],
      vipCreatorCategoryId: null,
      vipCreatorChannelId: null,
      vipPanelChannelId: null,
      vipRoomCategoryId: null
    };
    saveDB();
  }

  const guildData = db.guilds[guildId];
  if (!Object.prototype.hasOwnProperty.call(guildData, 'voiceSearchChannelId')) {
    guildData.voiceSearchChannelId = null;
    saveDB();
  }

  return guildData;
}

function cleanName(name) {
  return String(name || 'User')
    .replace(/[\n\r`@#]/g, '')
    .trim()
    .slice(0, 50) || 'User';
}


function uniqueIds(ids) {
  return [...new Set((ids || []).filter(Boolean))];
}

function findRoleByKeywords(guild, keywordGroups) {
  const roles = [...guild.roles.cache.values()]
    .filter(role => role.id !== guild.id)
    .sort((a, b) => b.position - a.position);

  for (const keywords of keywordGroups) {
    const found = roles.find(role => {
      const name = role.name.toLowerCase();
      return keywords.every(keyword => name.includes(keyword));
    });
    if (found) return found;
  }

  return null;
}

function autoDetectRoles(guild, guildData) {
  if (!guildData.juraganRoleId) {
    guildData.juraganRoleId = findRoleByKeywords(guild, [['juragan']])?.id || null;
  }

  if (!guildData.donaturRoleId) {
    guildData.donaturRoleId = findRoleByKeywords(guild, [['donatur'], ['donor']])?.id || null;
  }

  if (!guildData.adminRoleId) {
    guildData.adminRoleId = findRoleByKeywords(guild, [['admin', 'tulus'], ['admin']])?.id || null;
  }

  if (!guildData.coRoleId) {
    guildData.coRoleId = findRoleByKeywords(guild, [
      ['co', 'orang', 'tulus'],
      ['co', 'owner'],
      ['co-owner'],
      ['co']
    ])?.id || null;
  }
}

function validRoleIds(guild, ids) {
  return uniqueIds(ids).filter(roleId => guild.roles.cache.has(roleId));
}

function getPremiumRoleIds(guildData) {
  return uniqueIds([guildData.juraganRoleId, guildData.donaturRoleId]);
}

function getStaffAccessRoleIds(guildData) {
  return uniqueIds([
    guildData.adminRoleId,
    guildData.coRoleId,
    ...(config.adminRoleIds || []),
    ...(config.staffRoleIds || [])
  ]);
}

function getAllAccessRoleIds(guildData) {
  return uniqueIds([...getPremiumRoleIds(guildData), ...getStaffAccessRoleIds(guildData)]);
}

function formatRoomName(member, roomType = 'public') {
  const username = cleanName(member.displayName || member.user.username);
  const template = roomType === 'vip' ? config.vipRoomNameFormat : config.publicRoomNameFormat;
  return String(template).replace('{user}', username).replace('{username}', username).slice(0, 95);
}

function isStaff(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;

  const guildData = db.guilds[member.guild.id] || {};
  const ids = getStaffAccessRoleIds(guildData);
  return ids.some(roleId => member.roles.cache.has(roleId));
}

function canUseCreator(member, guildData) {
  if (!guildData.boostOnly) return true;
  if (isStaff(member)) return true;
  const allowedRoleIds = [guildData.juraganRoleId, guildData.donaturRoleId].filter(Boolean);
  if (allowedRoleIds.length === 0) return false;
  return allowedRoleIds.some(roleId => member.roles.cache.has(roleId));
}

function hasRoomControl(interaction, roomData) {
  return roomData.ownerId === interaction.user.id || isStaff(interaction.member);
}

async function sendLog(guild, message) {
  const guildData = ensureGuildData(guild.id);
  if (!guildData.logChannelId) return;

  const channel = await guild.channels.fetch(guildData.logChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  await channel.send({ content: message }).catch(() => null);
}

function animatedEmojiUrl() {
  return `https://cdn.discordapp.com/emojis/${config.animatedEmojiId}.gif?size=128&quality=lossless`;
}

function panelEmbed(guildData, panelType = 'public', thumbnailUrl = animatedEmojiUrl()) {
  const isVip = panelType === 'vip';
  const triggerName = isVip ? config.vipCreatorChannelName : config.publicCreatorChannelName;
  const roomName = isVip ? config.vipRoomNameFormat : config.publicRoomNameFormat;
  const accessText = isVip
    ? [guildData.juraganRoleId, guildData.donaturRoleId, guildData.adminRoleId, guildData.coRoleId]
        .filter(Boolean).map(id => `<@&${id}>`).join(' • ') || 'Juragan • Donatur • Admin • Co Owner'
    : 'Seluruh warga DESA TULUS';

  return new EmbedBuilder()
    .setColor(config.embedColor)
    .setAuthor({ name: 'DESA TULUS', iconURL: animatedEmojiUrl() })
    .setTitle(isVip ? 'Panel Pengaturan Villa' : config.panelTitle)
    .setDescription([
      `Masuk ke **${triggerName}** untuk membuat ${isVip ? 'Villa' : 'Rumah'} pribadi.`,
      `Nama otomatis: \`${roomName}\``,
      '',
      '**Kontrol Ruangan**',
      '✏️ **Ganti Nama** — Ubah nama voice',
      '👥 **Batas User** — Atur kapasitas voice',
      '🔒 **Kunci** — Tutup akses member lain',
      '🔓 **Buka** — Buka kembali akses member lain',
      '👁️ **Privasi** — Sembunyikan voice',
      '🟩 **Tampil** — Tampilkan kembali voice',
      '✅ **Izinkan** — Beri akses khusus walau terkunci',
      '❌ **Tolak** — Larang member masuk',
      '👢 **Keluarkan** — Keluarkan tanpa memblokir',
      '🗑️ **Hapus** — Tutup voice pribadi',
      '',
      `**Akses:** ${accessText}`,
      'Hanya pemilik voice dan staff yang dapat memakai panel.'
    ].join('\n'))
    .setThumbnail(thumbnailUrl)
    .setFooter({ text: config.panelFooter, iconURL: animatedEmojiUrl() })
    .setTimestamp();
}

function panelComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('voice_rename').setLabel('Ganti Nama').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('voice_limit').setLabel('Batas User').setEmoji('👥').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('voice_lock').setLabel('Kunci').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('voice_unlock').setLabel('Buka').setEmoji('🔓').setStyle(ButtonStyle.Success)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('voice_hide').setLabel('Privasi').setEmoji('👁️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('voice_show').setLabel('Tampil').setEmoji('🟩').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('voice_permit').setLabel('Izinkan').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('voice_reject').setLabel('Tolak').setEmoji('❌').setStyle(ButtonStyle.Danger)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('voice_kick').setLabel('Keluarkan').setEmoji('👢').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('voice_delete').setLabel('Hapus').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
    )
  ];
}

async function sendVoicePanel(channel, guildData, panelType = 'public') {
  const thumbnailPath = path.join(__dirname, 'assets', 'desa-tulus-panel.png');
  const hasCustomThumbnail = fs.existsSync(thumbnailPath);
  const thumbnailUrl = hasCustomThumbnail
    ? 'attachment://desa-tulus-panel.png'
    : animatedEmojiUrl();

  const payload = {
    embeds: [panelEmbed(guildData, panelType, thumbnailUrl)],
    components: panelComponents()
  };

  if (hasCustomThumbnail) {
    payload.files = [{
      attachment: thumbnailPath,
      name: 'desa-tulus-panel.png'
    }];
  }

  return channel.send(payload);
}


async function replyOrEdit(interaction, payload) {
  const data = typeof payload === 'string' ? { content: payload } : payload;

  if (interaction.deferred) {
    return interaction.editReply(data);
  }

  if (interaction.replied) {
    return interaction.followUp({ ...data, flags: MessageFlags.Ephemeral });
  }

  return interaction.reply({ ...data, flags: MessageFlags.Ephemeral });
}

async function getUserRoom(interaction) {
  const voiceChannel = interaction.member?.voice?.channel;
  if (!voiceChannel) {
    await replyOrEdit(interaction, '❌ Kamu harus berada di Rumah atau Villa Radio Desa dulu.');
    return null;
  }

  const roomData = db.rooms[voiceChannel.id];
  if (!roomData) {
    await replyOrEdit(interaction, '❌ Ini bukan room yang dibuat Radio Desa.');
    return null;
  }

  return { voiceChannel, roomData };
}

async function requireControl(interaction) {
  const result = await getUserRoom(interaction);
  if (!result) return null;

  if (!hasRoomControl(interaction, result.roomData)) {
    await replyOrEdit(interaction, '❌ Hanya owner room atau staff yang bisa memakai panel ini.');
    return null;
  }

  return result;
}

async function getBotMember(guild) {
  return guild.members.me || guild.members.fetchMe();
}

async function checkBotCanEditVoice(interaction, voiceChannel) {
  const me = await getBotMember(interaction.guild);
  const channelPerms = voiceChannel.permissionsFor(me);
  const missing = [];

  if (!channelPerms?.has(PermissionFlagsBits.ViewChannel)) missing.push('View Channel');
  if (!channelPerms?.has(PermissionFlagsBits.ManageChannels)) missing.push('Manage Channels');
  if (!channelPerms?.has(PermissionFlagsBits.MoveMembers)) missing.push('Move Members');

  if (missing.length) {
    await replyOrEdit(interaction, {
      content: [
        `❌ Bot belum punya permission di voice ini: **${missing.join(', ')}**.`,
        'Pastikan role bot di atas role member, lalu beri **Manage Channels + Move Members** di category voice.',
        'Kalau masih error, jalankan ulang `/voice-setup` setelah permission bot dibenerin.'
      ].join('\n'),
      components: []
    });
    return false;
  }

  return true;
}

function interactionErrorMessage(error) {
  const code = error?.code ? `Kode: ${error.code}` : '';
  const raw = error?.message || 'Unknown error';

  if (error?.code === 50013 || /Missing Permissions/i.test(raw)) {
    return [
      '❌ Discord menolak aksi ini karena bot masih kurang permission di channel voice itu.',
      '',
      'Cek ini:',
      '1. Role bot harus di atas role member biasa.',
      '2. Bot harus punya **Manage Channels** di kategori gedung voice.',
      '3. Jangan ada permission kategori yang **Deny Manage Channels** untuk role bot.',
      '4. Invite ulang bot kalau dulu belum dikasih permission **Manage Channels**.',
      code ? `\n${code}` : ''
    ].filter(Boolean).join('\n');
  }

  if (error?.code === 10003) {
    return '❌ Voice-nya sudah tidak ada. Buat lagi melalui `🏡 │ Buat Rumah` atau `🏯 │ Buat Villa`.';
  }

  if (error?.code === 10062 || /Unknown interaction/i.test(raw)) {
    return '❌ Tombolnya sudah kedaluwarsa. Coba klik ulang atau kirim panel baru pakai `/voice-panel`.';
  }

  return `❌ Ada error saat menjalankan tombol ini. ${code}\nDetail: ${String(raw).slice(0, 160)}`;
}


function buildCreatorVoiceOverwrites(guild, guildData, botId) {
  const accessRoleIds = validRoleIds(guild, getAllAccessRoleIds(guildData));

  return [
    {
      id: guild.roles.everyone.id,
      allow: [PermissionFlagsBits.ViewChannel],
      deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
    },
    ...accessRoleIds.map(roleId => ({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak
      ]
    })),
    {
      id: botId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.MoveMembers
      ]
    }
  ];
}

function buildPanelOverwrites(guild, guildData, botId, vipOnly = false) {
  const vipRoleIds = validRoleIds(guild, getAllAccessRoleIds(guildData));
  const base = [{ id: guild.roles.everyone.id, allow: vipOnly ? [] : [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: vipOnly ? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] : [PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads] }];
  if (vipOnly) {
    base.push(...vipRoleIds.map(roleId => ({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] })));
  }
  base.push({ id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] });
  return base;
}

function buildVoiceSearchOverwrites(guild, botId) {
  return [
    {
      id: guild.roles.everyone.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.UseApplicationCommands
      ],
      deny: [
        PermissionFlagsBits.CreatePublicThreads,
        PermissionFlagsBits.CreatePrivateThreads,
        PermissionFlagsBits.MentionEveryone
      ]
    },
    {
      id: botId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ManageMessages
      ]
    }
  ];
}

function buildRoomCategoryOverwrites(guild, guildData, botId) {
  const accessRoleIds = validRoleIds(guild, getAllAccessRoleIds(guildData));

  return [
    {
      // Member biasa boleh melihat category ⎯⎯⎯⎯⎯⎯ dan room di dalamnya,
      // tapi tetap tidak bisa masuk kecuali setup dibuat public.
      id: guild.roles.everyone.id,
      allow: [PermissionFlagsBits.ViewChannel],
      deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
    },
    ...accessRoleIds.map(roleId => ({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak
      ]
    })),
    {
      id: botId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.MoveMembers
      ]
    }
  ];
}

function buildTempRoomOverwrites(guild, guildData, botId, ownerId) {
  const staffRoleIds = validRoleIds(guild, getStaffAccessRoleIds(guildData));

  return [
    {
      // Room aktif default-nya terbuka. Tombol Kunci/Privat yang nanti menutup akses.
      id: guild.roles.everyone.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak
      ]
    },
    ...staffRoleIds.map(roleId => ({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.MoveMembers
      ]
    })),
    {
      id: ownerId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak
      ]
    },
    {
      id: botId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.MoveMembers
      ]
    }
  ];
}

async function findOrCreateCategory(guild, name, permissionOverwrites, reason) {
  let category = guild.channels.cache.find(channel => channel.type === ChannelType.GuildCategory && channel.name === name);

  if (!category) {
    category = await guild.channels.create({
      name,
      type: ChannelType.GuildCategory,
      permissionOverwrites,
      reason
    });
    return category;
  }

  await category.permissionOverwrites.set(permissionOverwrites, `${reason}: sync permission`).catch(() => null);
  return category;
}

async function syncChannelPermissions(channel, permissionOverwrites, reason) {
  await channel.permissionOverwrites.set(permissionOverwrites, reason).catch(error => {
    console.error(`❌ Gagal sync permission ${channel.name}:`, error?.message || error);
  });
}

async function ensureTextChannel(guild, storedId, name, parentId, overwrites, reason) {
  let channel = storedId ? await guild.channels.fetch(storedId).catch(() => null) : null;
  if (!channel) channel = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === name && c.parentId === parentId) || null;
  if (!channel) channel = await guild.channels.create({ name, type: ChannelType.GuildText, parent: parentId, permissionOverwrites: overwrites, reason });
  else { await channel.setParent(parentId, { lockPermissions: false }).catch(() => null); await syncChannelPermissions(channel, overwrites, `${reason}: sync`); }
  return channel;
}

async function ensureVoiceTrigger(guild, storedId, name, parentId, overwrites, reason) {
  let channel = storedId ? await guild.channels.fetch(storedId).catch(() => null) : null;
  if (!channel) channel = guild.channels.cache.find(c => c.type === ChannelType.GuildVoice && c.name === name && c.parentId === parentId) || null;
  if (!channel) channel = await guild.channels.create({ name, type: ChannelType.GuildVoice, parent: parentId, userLimit: 1, permissionOverwrites: overwrites, reason });
  else { await channel.setName(name, `${reason}: rename`).catch(() => null); await channel.setParent(parentId, { lockPermissions: false }).catch(() => null); await channel.setUserLimit(1).catch(() => null); await syncChannelPermissions(channel, overwrites, `${reason}: sync`); }
  return channel;
}

function buildPublicCreatorOverwrites(guild, botId) {
  return [
    { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
    { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] }
  ];
}

function buildVipCreatorOverwrites(guild, guildData, botId) {
  const access = validRoleIds(guild, getAllAccessRoleIds(guildData));
  return [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
    ...access.map(id => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] })),
    { id: botId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers] }
  ];
}

async function setupGuild(interaction) {
  const guild = interaction.guild;
  const guildData = ensureGuildData(guild.id);
  const me = await getBotMember(guild);
  guildData.juraganRoleId = interaction.options.getRole('juragan_role')?.id || guildData.juraganRoleId || null;
  guildData.donaturRoleId = interaction.options.getRole('donatur_role')?.id || guildData.donaturRoleId || null;
  guildData.adminRoleId = interaction.options.getRole('admin_role')?.id || guildData.adminRoleId || null;
  guildData.coRoleId = interaction.options.getRole('co_role')?.id || guildData.coRoleId || null;
  guildData.logChannelId = interaction.options.getChannel('log_channel')?.id || guildData.logChannelId || null;
  autoDetectRoles(guild, guildData);

  const publicCreatorOw = buildPublicCreatorOverwrites(guild, me.id);
  const vipCreatorOw = buildVipCreatorOverwrites(guild, guildData, me.id);
  const publicRoomOw = buildRoomCategoryOverwrites(guild, guildData, me.id);

  const publicCreatorCategory = await findOrCreateCategory(guild, config.publicCreatorCategoryName, publicCreatorOw, 'Radio Desa: category buat rumah');
  const publicRoomCategories = [];
  for (const name of config.publicRoomCategoryNames) publicRoomCategories.push(await findOrCreateCategory(guild, name, publicRoomOw, 'Radio Desa: category ruang warga'));
  let vipCreatorCategory = guildData.vipCreatorCategoryId ? await guild.channels.fetch(guildData.vipCreatorCategoryId).catch(() => null) : null;
  if (!vipCreatorCategory || vipCreatorCategory.type !== ChannelType.GuildCategory) {
    vipCreatorCategory = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === config.vipCreatorCategoryName && c.id !== publicCreatorCategory.id) || null;
  }
  if (!vipCreatorCategory) {
    vipCreatorCategory = await guild.channels.create({ name: config.vipCreatorCategoryName, type: ChannelType.GuildCategory, permissionOverwrites: vipCreatorOw, reason: 'Radio Desa: category buat villa' });
  } else {
    await vipCreatorCategory.permissionOverwrites.set(vipCreatorOw, 'Radio Desa: sync category buat villa').catch(() => null);
  }
  const vipRoomCategory = await findOrCreateCategory(guild, config.vipRoomCategoryName, vipCreatorOw, 'Radio Desa: category ruang VIP');

  const publicCreator = await ensureVoiceTrigger(guild, guildData.publicCreatorChannelId || guildData.creatorChannelId, config.publicCreatorChannelName, publicCreatorCategory.id, publicCreatorOw, 'Radio Desa: trigger rumah');
  const vipCreator = await ensureVoiceTrigger(guild, guildData.vipCreatorChannelId, config.vipCreatorChannelName, vipCreatorCategory.id, vipCreatorOw, 'Radio Desa: trigger villa');
  const publicPanel = await ensureTextChannel(guild, guildData.publicPanelChannelId || guildData.panelChannelId, config.publicPanelChannelName, publicCreatorCategory.id, buildPanelOverwrites(guild, guildData, me.id, false), 'Radio Desa: panel warga');
  const voiceSearchChannel = await ensureTextChannel(guild, guildData.voiceSearchChannelId, config.voiceSearchChannelName, publicCreatorCategory.id, buildVoiceSearchOverwrites(guild, me.id), 'Radio Desa: cari voice warga');
  const vipPanel = await ensureTextChannel(guild, guildData.vipPanelChannelId, config.vipPanelChannelName, vipCreatorCategory.id, buildPanelOverwrites(guild, guildData, me.id, true), 'Radio Desa: panel VIP');

  Object.assign(guildData, {
    publicCreatorCategoryId: publicCreatorCategory.id,
    publicCreatorChannelId: publicCreator.id,
    publicPanelChannelId: publicPanel.id,
    voiceSearchChannelId: voiceSearchChannel.id,
    publicRoomCategoryIds: publicRoomCategories.map(c => c.id),
    vipCreatorCategoryId: vipCreatorCategory.id,
    vipCreatorChannelId: vipCreator.id,
    vipPanelChannelId: vipPanel.id,
    vipRoomCategoryId: vipRoomCategory.id,
    creatorChannelId: publicCreator.id,
    panelChannelId: publicPanel.id,
    roomCategoryId: publicRoomCategories[0].id,
    categoryId: publicRoomCategories[0].id,
    boostOnly: false
  });
  saveDB();
  await sendVoicePanel(publicPanel, guildData, 'public');
  await sendVoicePanel(vipPanel, guildData, 'vip');
  await interaction.editReply([
    '✅ **Radio Desa berhasil disiapkan tanpa mereset data lama.**',
    `Rumah warga: <#${publicCreator.id}>`,
    `Panel warga: <#${publicPanel.id}>`,
    `Cari voice: <#${voiceSearchChannel.id}>`,
    `Ruang Warga 1: <#${publicRoomCategories[0].id}>`,
    `Ruang Warga 2: <#${publicRoomCategories[1].id}>`,
    `Villa VIP: <#${vipCreator.id}>`,
    `Panel VIP: <#${vipPanel.id}>`,
    `Ruang VIP: <#${vipRoomCategory.id}>`
  ].join('\n'));
}

async function choosePublicRoomCategory(guild, guildData, botId) {
  const ids = Array.isArray(guildData.publicRoomCategoryIds) ? guildData.publicRoomCategoryIds : [];
  const categories = [];
  for (let i = 0; i < config.publicRoomCategoryNames.length; i++) {
    let c = ids[i] ? await guild.channels.fetch(ids[i]).catch(() => null) : null;
    if (!c) c = await findOrCreateCategory(guild, config.publicRoomCategoryNames[i], buildRoomCategoryOverwrites(guild, guildData, botId), 'Radio Desa: ruang warga');
    categories.push(c);
  }
  guildData.publicRoomCategoryIds = categories.map(c => c.id); saveDB();
  const capacity = Number(config.publicCategoryCapacity || 10);
  return categories.find(c => c.children.cache.filter(ch => ch.type === ChannelType.GuildVoice && db.rooms[ch.id]?.roomType === 'public').size < capacity) || categories[categories.length - 1];
}

async function ensureVipRoomCategory(guild, guildData, botId) {
  let c = guildData.vipRoomCategoryId ? await guild.channels.fetch(guildData.vipRoomCategoryId).catch(() => null) : null;
  if (!c) c = await findOrCreateCategory(guild, config.vipRoomCategoryName, buildVipCreatorOverwrites(guild, guildData, botId), 'Radio Desa: ruang VIP');
  guildData.vipRoomCategoryId = c.id; saveDB(); return c;
}

async function createTemporaryRoom(newState, roomType = 'public') {
  const guild = newState.guild;
  const member = newState.member;
  const guildData = ensureGuildData(guild.id);
  if (member.user.bot) return;
  if (roomType === 'vip' && !isStaff(member) && !getPremiumRoleIds(guildData).some(id => member.roles.cache.has(id))) {
    await member.voice.disconnect('Radio Desa: Villa khusus VIP').catch(() => null);
    await member.send('❌ Villa hanya untuk Juragan, Donatur, Admin, Co Owner, dan Staff DESA TULUS.').catch(() => null);
    return;
  }
  const existing = Object.entries(db.rooms).find(([, d]) => d.guildId === guild.id && d.ownerId === member.id);
  if (existing) {
    const channel = await guild.channels.fetch(existing[0]).catch(() => null);
    if (channel) { await member.voice.setChannel(channel, 'Radio Desa: kembali ke room aktif').catch(() => null); return; }
    delete db.rooms[existing[0]];
  }
  const me = await getBotMember(guild);
  const category = roomType === 'vip' ? await ensureVipRoomCategory(guild, guildData, me.id) : await choosePublicRoomCategory(guild, guildData, me.id);
  const channel = await guild.channels.create({
    name: formatRoomName(member, roomType), type: ChannelType.GuildVoice, parent: category.id,
    userLimit: Number(config.defaultUserLimit || 0),
    permissionOverwrites: roomType === 'vip' ? buildTempRoomOverwrites(guild, guildData, me.id, member.id).map(o => o.id === guild.roles.everyone.id ? { id:o.id, deny:[PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] } : o) : buildTempRoomOverwrites(guild, guildData, me.id, member.id),
    reason: `Radio Desa: ${roomType === 'vip' ? 'Villa' : 'Rumah'} dibuat oleh ${member.user.tag}`
  });
  db.rooms[channel.id] = { guildId:guild.id, ownerId:member.id, roomType, createdAt:Date.now(), locked:false, hidden:false, permittedUserIds:[], rejectedUserIds:[], blockedUserIds:[] };
  saveDB();
  try { await member.voice.setChannel(channel, 'Radio Desa: pindah ke room baru'); }
  catch { await channel.delete('Radio Desa: gagal memindahkan owner').catch(()=>null); delete db.rooms[channel.id]; saveDB(); return; }
  await sendLog(guild, `${roomType === 'vip' ? '🏯' : '🏡'} <@${member.id}> membuat <#${channel.id}>.`);
}

function cancelRoomCleanup(channelId) {
  if (!channelId) return;
  const timer = roomDeleteTimers.get(channelId);
  if (timer) clearTimeout(timer);
  roomDeleteTimers.delete(channelId);
}

function isProtectedVoiceChannel(guildData, channelId) {
  if (!guildData || !channelId) return false;
  return [
    guildData.publicCreatorChannelId,
    guildData.vipCreatorChannelId,
    guildData.creatorChannelId
  ].filter(Boolean).includes(channelId);
}

async function deleteManagedRoomIfEmpty(guild, channelId, reason = 'Radio Desa: room kosong') {
  if (!channelId || !db.rooms[channelId]) return false;

  const guildData = ensureGuildData(guild.id);
  // Pengaman: channel Buat Rumah/Buat Villa tidak boleh pernah ikut terhapus.
  if (isProtectedVoiceChannel(guildData, channelId)) return false;

  const channel = guild.channels.cache.get(channelId)
    || await guild.channels.fetch(channelId).catch(() => null);

  if (!channel) {
    delete db.rooms[channelId];
    saveDB();
    cancelRoomCleanup(channelId);
    return true;
  }

  if (channel.type !== ChannelType.GuildVoice) return false;

  // Bot tidak dihitung sebagai warga. Jika hanya bot yang tersisa, room tetap kosong.
  const humanCount = channel.members.filter(member => !member.user.bot).size;
  if (humanCount > 0) return false;

  await sendLog(guild, `🗑️ Voice sementara <#${channelId}> dihapus karena tidak ada warga di dalamnya.`);
  const deleted = await channel.delete(reason).then(() => true).catch(error => {
    console.error(`❌ Gagal menghapus room kosong ${channelId}:`, error?.message || error);
    return false;
  });

  if (deleted) {
    delete db.rooms[channelId];
    saveDB();
  }

  cancelRoomCleanup(channelId);
  return deleted;
}

function scheduleRoomCleanup(guild, channelId, customDelayMs = null) {
  if (!channelId || !db.rooms[channelId]) return;

  cancelRoomCleanup(channelId);
  const delay = customDelayMs ?? Number(config.deleteDelayMs || 3000);

  const timer = setTimeout(async () => {
    roomDeleteTimers.delete(channelId);
    await deleteManagedRoomIfEmpty(guild, channelId);
  }, Math.max(500, delay));

  roomDeleteTimers.set(channelId, timer);
}

async function cleanupRoom(oldState) {
  const channelId = oldState.channelId;
  if (!channelId || !db.rooms[channelId]) return;
  scheduleRoomCleanup(oldState.guild, channelId);
}


function normalizeRoomData(roomData) {
  roomData.locked = Boolean(roomData.locked);
  roomData.hidden = Boolean(roomData.hidden);
  roomData.permittedUserIds = uniqueIds(roomData.permittedUserIds || []);
  roomData.rejectedUserIds = uniqueIds(roomData.rejectedUserIds || roomData.blockedUserIds || []);
  roomData.blockedUserIds = roomData.rejectedUserIds;
  return roomData;
}

async function editOverwriteSafe(voiceChannel, id, permissions, reason) {
  await voiceChannel.permissionOverwrites.edit(id, permissions, { reason });
}

async function applyRoomPrivacyState(voiceChannel, guildData, roomData, botId, reason) {
  const guild = voiceChannel.guild;
  normalizeRoomData(roomData);

  const premiumRoleIds = validRoleIds(guild, getPremiumRoleIds(guildData));
  const staffRoleIds = validRoleIds(guild, getStaffAccessRoleIds(guildData));
  const isLocked = Boolean(roomData.locked);
  const isHidden = Boolean(roomData.hidden);

  // Member biasa:
  // - Unlock: bisa lihat + masuk.
  // - Lock: bisa lihat tapi tidak bisa masuk.
  // - Hide: tidak bisa lihat dan otomatis tidak bisa masuk.
  const isVipRoom = roomData.roomType === 'vip';
  await editOverwriteSafe(
    voiceChannel,
    guild.roles.everyone.id,
    isVipRoom
      ? { ViewChannel: false, Connect: false, Speak: false }
      : { ViewChannel: !isHidden, Connect: !isLocked && !isHidden, Speak: !isLocked && !isHidden },
    `${reason}: everyone state`
  );

  // Role premium mengikuti state room juga. Saat lock, owner benar-benar mengunci dari user lain.
  for (const roleId of premiumRoleIds) {
    await editOverwriteSafe(
      voiceChannel,
      roleId,
      {
        ViewChannel: !isHidden,
        Connect: !isLocked && !isHidden,
        Speak: !isLocked && !isHidden
      },
      `${reason}: premium role state`
    );
  }

  // Staff/Admin/Co selalu bisa bantu masuk dan lihat.
  for (const roleId of staffRoleIds) {
    await editOverwriteSafe(
      voiceChannel,
      roleId,
      { ViewChannel: true, Connect: true, Speak: true },
      `${reason}: staff bypass`
    );
  }

  // Owner room selalu bisa masuk dan lihat.
  await editOverwriteSafe(
    voiceChannel,
    roomData.ownerId,
    { ViewChannel: true, Connect: true, Speak: true },
    `${reason}: owner bypass`
  );

  // User yang di-permit selalu bisa masuk, bahkan saat room locked/hidden.
  for (const userId of roomData.permittedUserIds) {
    if (userId === roomData.ownerId) continue;
    await editOverwriteSafe(
      voiceChannel,
      userId,
      { ViewChannel: true, Connect: true, Speak: true },
      `${reason}: permitted user`
    );
  }

  // User yang di-reject tidak bisa masuk. Ini sengaja setelah permit supaya reject lebih kuat jika ada data bentrok.
  for (const userId of roomData.rejectedUserIds) {
    if (userId === roomData.ownerId) continue;
    await editOverwriteSafe(
      voiceChannel,
      userId,
      { Connect: false, Speak: false },
      `${reason}: rejected user`
    );
  }

  await editOverwriteSafe(
    voiceChannel,
    botId,
    {
      ViewChannel: true,
      Connect: true,
      Speak: true,
      ManageChannels: true,
      MoveMembers: true
    },
    `${reason}: bot permission`
  );

  saveDB();
}

async function applyRoomLock(voiceChannel, guildData, roomData, botId, reason) {
  normalizeRoomData(roomData);
  roomData.locked = true;
  await applyRoomPrivacyState(voiceChannel, guildData, roomData, botId, reason);
}

async function applyRoomUnlock(voiceChannel, guildData, roomData, botId, reason) {
  normalizeRoomData(roomData);
  roomData.locked = false;
  await applyRoomPrivacyState(voiceChannel, guildData, roomData, botId, reason);
}

async function applyRoomHide(voiceChannel, guildData, roomData, botId, reason) {
  normalizeRoomData(roomData);
  roomData.hidden = true;
  await applyRoomPrivacyState(voiceChannel, guildData, roomData, botId, reason);
}

async function applyRoomShow(voiceChannel, guildData, roomData, botId, reason) {
  normalizeRoomData(roomData);
  roomData.hidden = false;
  await applyRoomPrivacyState(voiceChannel, guildData, roomData, botId, reason);
}

function roomStatusText(roomData) {
  normalizeRoomData(roomData);
  const privacy = roomData.hidden ? 'Privat' : roomData.locked ? 'Terkunci' : 'Terbuka';
  const permitCount = roomData.permittedUserIds.length;
  const rejectCount = roomData.rejectedUserIds.length;
  return `${privacy} • Izinkan ${permitCount} • Tolak ${rejectCount}`;
}

function buildUserSelect(action, placeholder) {
  return new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(`voice_select_${action}`)
      .setPlaceholder(placeholder)
      .setMinValues(1)
      .setMaxValues(1)
  );
}


async function movePermittedMemberIfPossible(targetMember, voiceChannel) {
  if (!targetMember?.voice?.channelId) {
    return 'Member sudah diizinkan. Dia belum berada di voice lain, jadi dia bisa join manual.';
  }

  if (targetMember.voice.channelId === voiceChannel.id) {
    return 'Member sudah berada di room ini.';
  }

  try {
    await targetMember.voice.setChannel(voiceChannel, 'Radio Desa: permit auto move');
    return 'Member sedang online di voice lain, jadi sudah otomatis dipindahkan ke room ini.';
  } catch (error) {
    return 'Member sudah diizinkan, tapi bot tidak bisa memindahkan otomatis. Dia tetap bisa join manual.';
  }
}

function getVoiceSearchChannel(guild, guildData) {
  const stored = guildData.voiceSearchChannelId
    ? guild.channels.cache.get(guildData.voiceSearchChannelId)
    : null;

  if (stored?.isTextBased()) return stored;

  const found = guild.channels.cache.find(channel =>
    channel.type === ChannelType.GuildText &&
    channel.name === config.voiceSearchChannelName
  );

  if (found) {
    guildData.voiceSearchChannelId = found.id;
    saveDB();
  }

  return found || null;
}

function voiceLookupResult(member) {
  const displayName = cleanName(member.displayName || member.user?.username || 'User');
  const voiceChannel = member.voice?.channel;

  if (voiceChannel) {
    return `🔊 **${displayName}** sedang berada di voice <#${voiceChannel.id}>`;
  }

  return `🔇 **${displayName}** tidak sedang berada di voice channel.`;
}

function voiceLookupChannelWarning(searchChannel) {
  return searchChannel
    ? `Gunakan command ini di <#${searchChannel.id}>.`
    : 'Channel cari voice belum dibuat. Minta staff menjalankan `/radio-setup`.';
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client.once(Events.ClientReady, async readyClient => {
  console.log(`🎙️ ${config.botName} online sebagai ${readyClient.user.tag}`);
  await autoRegisterSlashCommands(readyClient);

  // Bersihkan data channel yang sudah hilang dan hapus room terkelola yang kosong
  // setelah restart. Nama/setting room yang masih berisi warga tidak disentuh.
  for (const [channelId, roomData] of Object.entries(db.rooms)) {
    const guild = readyClient.guilds.cache.get(roomData.guildId);
    const channel = guild ? await guild.channels.fetch(channelId).catch(() => null) : null;
    if (!channel) {
      delete db.rooms[channelId];
      continue;
    }

    if (channel.type === ChannelType.GuildVoice) {
      const humanCount = channel.members.filter(member => !member.user.bot).size;
      if (humanCount === 0) scheduleRoomCleanup(guild, channelId, 5000);
    }
  }
  saveDB();
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  try {
    const guildData = ensureGuildData(newState.guild.id);

    // Jika ada warga masuk kembali sebelum timer selesai, pembatalan hapus otomatis.
    if (newState.channelId && db.rooms[newState.channelId]) {
      cancelRoomCleanup(newState.channelId);
    }

    if (newState.channelId && newState.channelId === (guildData.publicCreatorChannelId || guildData.creatorChannelId)) {
      await createTemporaryRoom(newState, 'public');
    }
    if (newState.channelId && newState.channelId === guildData.vipCreatorChannelId) {
      await createTemporaryRoom(newState, 'vip');
    }

    if (oldState.channelId && oldState.channelId !== newState.channelId) {
      await cleanupRoom(oldState);
    }
  } catch (error) {
    console.error('❌ Error voiceStateUpdate:', error);
  }
});

client.on(Events.ChannelDelete, channel => {
  if (!db.rooms[channel.id]) return;
  cancelRoomCleanup(channel.id);
  delete db.rooms[channel.id];
  saveDB();
});

client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot || !message.content.toLowerCase().startsWith('r')) return;
  const command = message.content.trim().toLowerCase().split(/\s+/)[0];
  const guildData = ensureGuildData(message.guild.id);
  if (command === 'rhelp') return message.reply('**Radio Desa**\nMember: `rhelp`, `rstatus`, `rmyroom`, `rvoice @user`\nVIP: gunakan panel Villa\nStaff: `rpanel`, `rsetup`\nOwner: `rbackup`');
  if (command === 'rvoice') {
    const searchChannel = getVoiceSearchChannel(message.guild, guildData);
    if (!searchChannel || message.channel.id !== searchChannel.id) {
      return message.reply(voiceLookupChannelWarning(searchChannel));
    }

    const targetMember = message.mentions.members.first();
    if (!targetMember) {
      return message.reply('Cara pakai: `rvoice @user`');
    }

    return message.reply({
      content: voiceLookupResult(targetMember),
      allowedMentions: { repliedUser: false }
    });
  }
  if (['rstatus','rmyroom'].includes(command)) {
    const found = Object.entries(db.rooms).find(([,d]) => d.guildId===message.guild.id && d.ownerId===message.author.id);
    return message.reply(found ? `Room aktifmu: <#${found[0]}> • ${roomStatusText(found[1])}` : 'Kamu belum memiliki Rumah atau Villa aktif.');
  }
  if (command === 'rvip') return message.reply('Masuk ke **🏯 │ Buat Villa**. Fitur ini khusus Juragan, Donatur, Admin, Co Owner, dan Staff.');
  if (command === 'rpanel') {
    if (!isStaff(message.member)) return message.reply('Command ini khusus staff.');
    const pp = guildData.publicPanelChannelId ? await message.guild.channels.fetch(guildData.publicPanelChannelId).catch(()=>null) : null;
    const vp = guildData.vipPanelChannelId ? await message.guild.channels.fetch(guildData.vipPanelChannelId).catch(()=>null) : null;
    if (pp?.isTextBased()) await sendVoicePanel(pp,guildData,'public'); if (vp?.isTextBased()) await sendVoicePanel(vp,guildData,'vip');
    return message.reply('Panel Radio Desa sudah dikirim ulang.');
  }
  if (command === 'rsetup') return message.reply('Gunakan `/radio-setup` agar pilihan role dan channel dapat diisi dengan aman.');
  if (command === 'rbackup') { if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('Command ini khusus owner/admin.'); fs.copyFileSync(DB_PATH, path.join(__dirname, `db.backup-${Date.now()}.json`)); return message.reply('Backup data Radio Desa berhasil dibuat.'); }
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (['voice-setup', 'radio-setup'].includes(interaction.commandName)) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await setupGuild(interaction);
        return;
      }

      if (['voice-panel', 'radio-panel'].includes(interaction.commandName)) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const guildData = ensureGuildData(interaction.guild.id);
        const publicPanel = guildData.publicPanelChannelId ? await interaction.guild.channels.fetch(guildData.publicPanelChannelId).catch(() => null) : null;
        const vipPanel = guildData.vipPanelChannelId ? await interaction.guild.channels.fetch(guildData.vipPanelChannelId).catch(() => null) : null;
        if (!publicPanel && !vipPanel) { await interaction.editReply('❌ Panel belum ditemukan. Jalankan `/radio-setup`.'); return; }
        if (publicPanel?.isTextBased()) await sendVoicePanel(publicPanel, guildData, 'public');
        if (vipPanel?.isTextBased()) await sendVoicePanel(vipPanel, guildData, 'vip');
        await interaction.editReply('✅ Panel Rumah dan Villa sudah dikirim ulang.');
        return;
      }

      if (interaction.commandName === 'radio-help') {
        await interaction.reply({ content: '**Radio Desa**\n`/radio-voice user:@warga` cari posisi voice warga\n`/radio-status` status room\n`/radio-panel` kirim panel (staff)\n`/radio-setup` setup lengkap (staff)\nPrefix: `rhelp`, `rstatus`, `rvoice @user`, `rpanel`.', flags: MessageFlags.Ephemeral }); return;
      }
      if (interaction.commandName === 'radio-voice') {
        const guildData = ensureGuildData(interaction.guild.id);
        const searchChannel = getVoiceSearchChannel(interaction.guild, guildData);

        if (!searchChannel || interaction.channelId !== searchChannel.id) {
          await interaction.reply({
            content: voiceLookupChannelWarning(searchChannel),
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        const targetUser = interaction.options.getUser('user', true);
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

        if (!targetMember) {
          await interaction.reply({
            content: 'Warga tersebut tidak ditemukan di server DESA TULUS.',
            flags: MessageFlags.Ephemeral
          });
          return;
        }

        await interaction.reply({
          content: voiceLookupResult(targetMember),
          allowedMentions: { parse: [] }
        });
        return;
      }

      if (interaction.commandName === 'radio-status') {
        const found = Object.entries(db.rooms).find(([, d]) => d.guildId === interaction.guild.id && d.ownerId === interaction.user.id);
        if (!found) { await interaction.reply({ content:'Kamu belum memiliki Rumah atau Villa aktif.', flags:MessageFlags.Ephemeral }); return; }
        const ch = await interaction.guild.channels.fetch(found[0]).catch(()=>null);
        await interaction.reply({ content: ch ? `Room aktifmu: <#${ch.id}> • **${roomStatusText(found[1])}**` : 'Data room ditemukan tetapi channel sudah tidak ada.', flags:MessageFlags.Ephemeral }); return;
      }

      if (['voice-reset', 'radio-reset'].includes(interaction.commandName)) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const guildId = interaction.guild.id;
        delete db.guilds[guildId];

        for (const [channelId, roomData] of Object.entries(db.rooms)) {
          if (roomData.guildId === guildId) delete db.rooms[channelId];
        }

        saveDB();
        await interaction.editReply('✅ Data setup temporary voice di server ini sudah direset. Channel yang sudah dibuat tidak ikut dihapus.');
        return;
      }
    }

    if (interaction.isButton()) {
      const action = interaction.customId.replace('voice_', '');

      if (['lock', 'unlock', 'hide', 'show', 'delete'].includes(action)) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const result = await requireControl(interaction);
        if (!result) return;

        const { voiceChannel, roomData } = result;
        if (!(await checkBotCanEditVoice(interaction, voiceChannel))) return;

        const guildData = ensureGuildData(interaction.guild.id);
        const me = await getBotMember(interaction.guild);

        if (action === 'lock') {
          await applyRoomLock(
            voiceChannel,
            guildData,
            roomData,
            me.id,
            `Radio Desa: lock oleh ${interaction.user.tag}`
          );
          await replyOrEdit(interaction, `🔒 Room dikunci. Akses baru ditutup. **${roomStatusText(roomData)}**.`);
          return;
        }

        if (action === 'unlock') {
          await applyRoomUnlock(
            voiceChannel,
            guildData,
            roomData,
            me.id,
            `Radio Desa: unlock oleh ${interaction.user.tag}`
          );
          await replyOrEdit(interaction, `🔓 Room dibuka. Member lain bisa masuk lagi. **${roomStatusText(roomData)}**.`);
          return;
        }

        if (action === 'hide') {
          await applyRoomHide(
            voiceChannel,
            guildData,
            roomData,
            me.id,
            `Radio Desa: hide oleh ${interaction.user.tag}`
          );
          await replyOrEdit(interaction, `◾ Room dibuat privat. Member biasa tidak melihat room ini. **${roomStatusText(roomData)}**.`);
          return;
        }

        if (action === 'show') {
          await applyRoomShow(
            voiceChannel,
            guildData,
            roomData,
            me.id,
            `Radio Desa: show oleh ${interaction.user.tag}`
          );
          await replyOrEdit(interaction, `◽ Room ditampilkan lagi. **${roomStatusText(roomData)}**.`);
          return;
        }

        if (action === 'delete') {
          delete db.rooms[voiceChannel.id];
          saveDB();
          await replyOrEdit(interaction, '🗑️ Room ditutup.');
          await voiceChannel.delete(`Radio Desa: dihapus oleh ${interaction.user.tag}`).catch(() => null);
          return;
        }
      }

      if (['claim', 'transfer'].includes(action)) {
        await replyOrEdit(interaction, 'ℹ️ Tombol Claim/Transfer sudah dihapus di versi baru. Hapus panel lama, lalu kirim panel baru pakai `/voice-panel`.');
        return;
      }

      if (action === 'rename') {
        const modal = new ModalBuilder()
          .setCustomId('voice_modal_rename')
          .setTitle('Ganti Nama Rumah / Villa');

        const input = new TextInputBuilder()
          .setCustomId('voice_name')
          .setLabel('Nama voice baru')
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(90)
          .setPlaceholder('Contoh: Rumah Mabar')
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
        return;
      }

      if (action === 'limit') {
        const modal = new ModalBuilder()
          .setCustomId('voice_modal_limit')
          .setTitle('Atur Batas User');

        const input = new TextInputBuilder()
          .setCustomId('voice_limit')
          .setLabel('Limit 0-99, isi 0 untuk unlimited')
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(2)
          .setPlaceholder('Contoh: 5')
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
        return;
      }

      if (['permit', 'reject', 'kick'].includes(action)) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const result = await requireControl(interaction);
        if (!result) return;

        const placeholders = {
          permit: 'Pilih member yang mau diberi akses room',
          reject: 'Pilih member yang mau ditolak dari room',
          kick: 'Pilih member yang mau dikeluarkan dari room'
        };

        await replyOrEdit(interaction, {
          content: [
            action === 'permit' ? '✓ Pilih member yang akan diberi akses khusus ke room ini.' : '',
            action === 'reject' ? '× Pilih member yang akan ditolak dari room ini.' : '',
            action === 'kick' ? '↗ Pilih member yang akan dikeluarkan dari room ini.' : ''
          ].filter(Boolean).join('\n'),
          components: [buildUserSelect(action, placeholders[action])]
        });
        return;
      }
    }

    if (interaction.isModalSubmit()) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await requireControl(interaction);
      if (!result) return;

      const { voiceChannel } = result;

      if (interaction.customId === 'voice_modal_rename') {
        const name = cleanName(interaction.fields.getTextInputValue('voice_name'));
        await voiceChannel.setName(name, `Radio Desa: rename oleh ${interaction.user.tag}`);
        await replyOrEdit(interaction, `✦ Nama room diganti menjadi **${name}**.`);
        return;
      }

      if (interaction.customId === 'voice_modal_limit') {
        const raw = interaction.fields.getTextInputValue('voice_limit').trim();
        const limit = Number(raw);

        if (!Number.isInteger(limit) || limit < 0 || limit > 99) {
          await replyOrEdit(interaction, '❌ Limit harus angka 0 sampai 99.');
          return;
        }

        await voiceChannel.setUserLimit(limit, `Radio Desa: limit oleh ${interaction.user.tag}`);
        await replyOrEdit(interaction, limit === 0 ? '👥 Limit dihapus. Room sekarang unlimited.' : `👥 Limit room diatur menjadi **${limit} user**.`);
        return;
      }
    }

    if (interaction.isUserSelectMenu() && interaction.customId.startsWith('voice_select_')) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const action = interaction.customId.replace('voice_select_', '');
      const result = await requireControl(interaction);
      if (!result) return;

      const { voiceChannel, roomData } = result;
      if (!(await checkBotCanEditVoice(interaction, voiceChannel))) return;

      const targetId = interaction.values[0];
      const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);

      if (!targetMember) {
        await replyOrEdit(interaction, '❌ Member tidak ditemukan.');
        return;
      }

      if (targetMember.user.bot) {
        await replyOrEdit(interaction, '❌ Pilih member manusia, bukan bot.');
        return;
      }

      if (targetId === roomData.ownerId && ['reject', 'kick'].includes(action)) {
        await replyOrEdit(interaction, '❌ Owner room tidak bisa di-reject atau di-kick dari room sendiri.');
        return;
      }

      const guildData = ensureGuildData(interaction.guild.id);
      const me = await getBotMember(interaction.guild);
      normalizeRoomData(roomData);

      if (action === 'permit') {
        roomData.permittedUserIds = uniqueIds([...(roomData.permittedUserIds || []), targetId]);
        roomData.rejectedUserIds = (roomData.rejectedUserIds || []).filter(id => id !== targetId);
        roomData.blockedUserIds = roomData.rejectedUserIds;
        await applyRoomPrivacyState(
          voiceChannel,
          guildData,
          roomData,
          me.id,
          `Radio Desa: permit ${targetMember.user.tag} oleh ${interaction.user.tag}`
        );
        const moveNote = await movePermittedMemberIfPossible(targetMember, voiceChannel);
        await replyOrEdit(interaction, [
          `✓ <@${targetId}> diberi akses ke <#${voiceChannel.id}>.`,
          moveNote,
          voiceChannel.userLimit > 0 ? `Catatan: room ini punya limit **${voiceChannel.userLimit} user**.` : '',
          `Status: **${roomStatusText(roomData)}**`
        ].filter(Boolean).join('\n'));
        return;
      }

      if (action === 'reject') {
        roomData.rejectedUserIds = uniqueIds([...(roomData.rejectedUserIds || []), targetId]);
        roomData.permittedUserIds = (roomData.permittedUserIds || []).filter(id => id !== targetId);
        roomData.blockedUserIds = roomData.rejectedUserIds;
        await applyRoomPrivacyState(
          voiceChannel,
          guildData,
          roomData,
          me.id,
          `Radio Desa: reject ${targetMember.user.tag} oleh ${interaction.user.tag}`
        );
        if (targetMember.voice.channelId === voiceChannel.id) {
          await targetMember.voice.disconnect('Radio Desa: rejected by room owner').catch(() => null);
        }
        await replyOrEdit(interaction, `× <@${targetId}> ditolak dari room ini. **${roomStatusText(roomData)}**.`);
        return;
      }

      if (action === 'kick') {
        if (targetMember.voice.channelId !== voiceChannel.id) {
          await replyOrEdit(interaction, `❌ <@${targetId}> tidak sedang berada di voice ini.`);
          return;
        }

        await targetMember.voice.disconnect('Radio Desa: kicked by room owner');
        await replyOrEdit(interaction, `↗ <@${targetId}> dikeluarkan dari room. Untuk blokir akses, pakai **Tolak**.`);
        return;
      }
    }
  } catch (error) {
    console.error('❌ Error interaction:', error);

    const message = interactionErrorMessage(error);
    if (interaction.deferred) {
      await interaction.editReply({ content: message, components: [] }).catch(() => null);
    } else if (interaction.replied) {
      await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral }).catch(() => null);
    } else {
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => null);
    }
  }
});

// Dashboard/web server sengaja tidak dijalankan pada runtime bot Railway.
// Railway Variables tetap dibaca langsung melalui process.env.
console.log('🌐 Dashboard Radio Desa dimatikan. Bot berjalan dalam mode Discord-only.');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN || process.env.TOKEN;

if (!DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN belum diisi. Isi DISCORD_TOKEN/TOKEN di Railway Variables atau file .env lokal.');
  process.exit(1);
}

client.login(DISCORD_TOKEN);
