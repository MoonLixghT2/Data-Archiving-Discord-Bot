/**
 * Command: .serverinfo
 *
 * Displays detailed information about the current Discord server.
 * Owner-only command.
 *
 * Usage:
 *   .serverinfo
 */

'use strict';

const { EmbedBuilder } = require('discord.js');
const { isOwner, denyAccess } = require('../../utils/permissions');

module.exports = {
  name: 'serverinfo',
  description: 'Displays server info: member count, channels, boost level, owner, creation date. Owner only.',
  usage: '.serverinfo',
  ownerOnly: true,

  async execute(message, args, client) {
    if (!isOwner(message)) {
      return denyAccess(message, 'Only the bot owner can use this command.');
    }

    const guild = message.guild;

    // Fetch full guild object to get owner and accurate member count
    await guild.fetch();

    const owner = await guild.fetchOwner().catch(() => null);
    const textChannels  = guild.channels.cache.filter((c) => c.type === 0).size;
    const voiceChannels = guild.channels.cache.filter((c) => c.type === 2).size;
    const categories    = guild.channels.cache.filter((c) => c.type === 4).size;
    const roles         = guild.roles.cache.size - 1; // Exclude @everyone
    const emojis        = guild.emojis.cache.size;
    const createdAt     = `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`;
    const boostLevel    = `Level ${guild.premiumTier} (${guild.premiumSubscriptionCount || 0} boosts)`;

    const embed = new EmbedBuilder()
      .setTitle(guild.name)
      .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
      .setColor(0x5865F2)
      .addFields(
        { name: 'Server ID',        value: guild.id,                                    inline: true },
        { name: 'Owner',            value: owner ? `${owner.user.tag}` : 'Unknown',     inline: true },
        { name: 'Owner ID',         value: guild.ownerId,                               inline: true },
        { name: 'Members',          value: guild.memberCount.toLocaleString(),          inline: true },
        { name: 'Boost Level',      value: boostLevel,                                  inline: true },
        { name: 'Verification',     value: guild.verificationLevel.toString(),          inline: true },
        { name: 'Text Channels',    value: textChannels.toString(),                     inline: true },
        { name: 'Voice Channels',   value: voiceChannels.toString(),                    inline: true },
        { name: 'Categories',       value: categories.toString(),                       inline: true },
        { name: 'Roles',            value: roles.toString(),                            inline: true },
        { name: 'Emojis',           value: emojis.toString(),                           inline: true },
        { name: 'Created',          value: createdAt,                                   inline: false },
      )
      .setFooter({ text: `Requested by ${message.author.tag}` })
      .setTimestamp();

    if (guild.description) {
      embed.setDescription(guild.description);
    }

    if (guild.bannerURL()) {
      embed.setImage(guild.bannerURL({ size: 1024 }));
    }

    return message.reply({ embeds: [embed] });
  },
};
