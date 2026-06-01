/**
 * Command: .ping
 *
 * Public command. Reports roundtrip message latency and WebSocket heartbeat latency.
 *
 * Usage:
 *   .ping
 */

'use strict';

module.exports = {
  name: 'ping',
  description: 'Shows roundtrip message latency and WebSocket heartbeat latency.',
  usage: '.ping',
  allowlistOnly: false,

  async execute(message, args, client) {
    const sent = await message.reply('**Pinging...**');
    const roundtrip = sent.createdTimestamp - message.createdTimestamp;
    const ws = Math.round(client.ws.ping);

    await sent.edit(
      `**Pong!**\n` +
      `- Roundtrip latency: \`${roundtrip}ms\`\n` +
      `- WebSocket heartbeat: \`${ws}ms\``
    );
  },
};
