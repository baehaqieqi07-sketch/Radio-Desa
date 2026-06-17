require('dotenv').config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
if (!token || !clientId || !guildId) { console.error('DISCORD_TOKEN, CLIENT_ID, dan GUILD_ID wajib diisi.'); process.exit(1); }
const setup = c => c.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addRoleOption(o=>o.setName('juragan_role').setDescription('Role Juragan').setRequired(false))
  .addRoleOption(o=>o.setName('donatur_role').setDescription('Role Donatur').setRequired(false))
  .addRoleOption(o=>o.setName('admin_role').setDescription('Role Admin').setRequired(false))
  .addRoleOption(o=>o.setName('co_role').setDescription('Role Co Owner').setRequired(false))
  .addChannelOption(o=>o.setName('log_channel').setDescription('Channel log').addChannelTypes(ChannelType.GuildText).setRequired(false));
const commands=[
 setup(new SlashCommandBuilder().setName('radio-setup').setDescription('Setup Rumah warga dan Villa VIP Radio Desa')),
 setup(new SlashCommandBuilder().setName('voice-setup').setDescription('Alias lama setup Radio Desa')),
 new SlashCommandBuilder().setName('radio-panel').setDescription('Kirim ulang panel Radio Desa').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
 new SlashCommandBuilder().setName('voice-panel').setDescription('Alias lama panel Radio Desa').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
 new SlashCommandBuilder().setName('radio-status').setDescription('Lihat status Rumah atau Villa milikmu'),
 new SlashCommandBuilder().setName('radio-help').setDescription('Panduan Radio Desa'),
 new SlashCommandBuilder().setName('radio-reset').setDescription('Reset referensi setup tanpa menghapus channel').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
 new SlashCommandBuilder().setName('voice-reset').setDescription('Alias lama reset').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(c=>c.toJSON());
(async()=>{ console.log('🔁 Mendaftarkan command Radio Desa...'); await new REST({version:'10'}).setToken(token).put(Routes.applicationGuildCommands(clientId,guildId),{body:commands}); console.log('✅ Command Radio Desa aktif.'); })().catch(e=>{console.error(e);process.exit(1)});
