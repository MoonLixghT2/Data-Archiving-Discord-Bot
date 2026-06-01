# Discord Archiver Bot

A production-ready Discord bot for archiving server data, recording voice channels, and generating organized datasets for AI training or long-term storage.

---

## Features

- **Message Archiving** — Scrape full channel history or track in real time. Stores text, embeds, attachments, reactions, edits, and deletions.
- **Attachment Downloading** — Downloads images, videos, and files with SHA-256 deduplication and retry logic.
- **Voice Recording** — Joins voice channels and records each participant to a separate WAV file.
- **Multi-Format Export** — Export archived data as TXT, JSON, JSONL, CSV, or PDF. Large exports are auto-zipped.
- **Keyword Search** — Full-text search across all archived messages with user, channel, and date filters.
- **Music System** — Slash-command music player supporting YouTube, Spotify, and SoundCloud with queue management.
- **Allowlist Access Control** — Fine-grained permission system: public commands, allowlist-only commands, and owner-only commands.
- **Resume Support** — Interrupted scrapes pick up exactly where they left off.
- **Organized Storage** — Every guild, channel, attachment type, and voice session has its own folder.

---

## Requirements

- **Node.js** >= 18.0.0
- **FFmpeg** — Required for voice recording and audio streaming.
- A Discord bot application with the correct intents enabled.

### Install FFmpeg

**Ubuntu / Debian:**
```bash
sudo apt update && sudo apt install ffmpeg
```

**macOS (Homebrew):**
```bash
brew install ffmpeg
```

**Windows:**
Download from [ffmpeg.org](https://ffmpeg.org/download.html) and add to your PATH.

---

## Installation

### 1. Clone and install dependencies

```bash
git clone https://github.com/yourname/discord-archiver-bot.git
cd discord-archiver-bot
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your values:

```env
BOT_TOKEN=your_bot_token_here
CLIENT_ID=your_application_client_id_here
OWNER_ID=your_discord_user_id_here

# Optional: Spotify support
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
```

### 3. Configure the bot (optional)

Edit `config/config.json` to adjust scrape batch sizes, download limits, voice recording settings, and more.

### 4. Add yourself to the allowlist

Edit `config/allowlist.json` before first run:

```json
{
  "users": ["YOUR_DISCORD_USER_ID"]
}
```

Or use `.allowuser <your_id>` after the bot starts (requires your ID to already be the `OWNER_ID`).

### 5. Start the bot

```bash
npm start
```

Slash commands are registered automatically on startup. Global propagation can take up to 1 hour — use the deploy script for instant guild registration:

```bash
GUILD_ID=your_guild_id node src/scripts/deployCommands.js
```

---

## Discord Developer Portal Setup

### Required Bot Intents (enable in the portal)

| Intent | Purpose |
|---|---|
| **Server Members Intent** | Resolving usernames in archived messages |
| **Message Content Intent** | Reading message text for archiving |
| **Guild Voice States** | Voice channel tracking and recording |

Go to: [discord.com/developers](https://discord.com/developers) → Your Application → Bot → Privileged Gateway Intents

### Required Bot Permissions

When inviting the bot, use these permissions (or grant them manually in server settings):

- Read Messages / View Channels
- Read Message History
- Send Messages
- Attach Files (for uploading export files)
- Connect (voice)
- Speak (voice)
- Use Application Commands (slash commands)

**Recommended Invite URL Permissions Integer:** `3214336`

---

## Commands

### General — Public

| Command | Description |
|---|---|
| `.ping` | Roundtrip and WebSocket latency. |
| `.cmds` | Lists all commands with descriptions and access levels. |

---

### Music — Public (Slash Commands)

| Command | Description |
|---|---|
| `/play <query or URL>` | Play from YouTube, Spotify, SoundCloud. Supports playlists and search by name. |
| `/skip` | Skip the current track. |
| `/stop` | Stop playback, clear queue, disconnect. |
| `/pause` | Pause the current track. |
| `/resume` | Resume paused playback. |
| `/nowplaying` | Detailed embed of the current track. |
| `/queue [page]` | View the music queue with pagination. |
| `/clearqueue` | Remove all upcoming tracks; current track keeps playing. |

---

### Archiving — Allowlist Only

| Command | Description |
|---|---|
| `.scrape [true\|false] [channel]` | Scrape historical messages. `true` downloads attachments. Leave channel blank for all channels. |
| `.channeltrack [channel]` | Enable real-time archiving. Leave blank to track all channels. |
| `.ignorechannel [channel]` | Disable real-time tracking. Leave blank to stop all. |
| `.export <format> [channel]` | Export to `txt`, `json`, `jsonl`, `csv`, or `pdf`. Leave channel blank for all channels. |
| `.search <keyword> [userID] [channel]` | Search archived messages. Use `--page N` to paginate. |
| `.stats` | Archive statistics for this server. |
| `.storage` | Detailed disk usage breakdown by category. |
| `.backup` | Create a full ZIP backup of all data and the database. |
| `.purgecache` | Clear temporary files. Does NOT touch archived data. |

---

### Voice — Allowlist Only

| Command | Description |
|---|---|
| `.joinvc <channel>` | Join a voice channel and start recording. Each user gets a separate WAV file. |
| `.dc` | Disconnect from voice. Finalizes all recordings and saves session metadata. |

---

### Access Control — Owner Only

| Command | Description |
|---|---|
| `.allowuser <user_id>` | Add a user to the allowlist by Discord user ID. |
| `.removeallowuser <user_id>` | Remove a user from the allowlist. |
| `.allowlist` | View all currently allowlisted users. |
| `.serverinfo` | Member count, channels, boost level, owner, and creation date. |
| `.announce <channel> <message>` | Send a formatted announcement embed to any channel in the server. |

---

## Access Control System

| Who | What they can use |
|---|---|
| **Everyone** | `.ping`, `.cmds`, all `/music` slash commands |
| **Allowlisted users** | All archiving, export, search, voice, and stats commands — in **any server** |
| **Bot owner** | Everything above, plus allowlist management |

Key behavior: allowlist membership is global, not per-server. An allowlisted user can use archive commands in any server the bot is in. A server admin who is not allowlisted cannot use archive commands.

---

## Storage Structure

```
/data
  /servers
    /<GUILD_ID>
      /channels
        /<CHANNEL_ID>
          messages.txt        — Human-readable plain text log
          messages.jsonl      — Machine-readable JSONL (one JSON per line)
          /attachments
            /images
            /videos
            /files
      /voice
        /<CHANNEL_ID>
          /<YYYY-MM-DD>
            <timestamp>_<username>_<userID>.wav
      /exports
        export_<channel>_<timestamp>.<format>
  /backups
    backup_<guildId>_<timestamp>.zip
  /cache
  archiver.db               — SQLite database (all indexed message/attachment records)
/logs
  bot-<date>.log
  error-<date>.log
  scrape-<date>.log
  voice-<date>.log
```

---

## Configuration Reference

### `config/config.json`

| Key | Default | Description |
|---|---|---|
| `prefix` | `.` | Prefix for all text commands |
| `ownerID` | `""` | Overridden by `OWNER_ID` env var |
| `storagePath` | `./data` | Root data directory |
| `scrape.batchSize` | `100` | Messages fetched per API call |
| `scrape.delayBetweenBatches` | `1200` | Milliseconds between batches (rate limit safety) |
| `scrape.maxRetries` | `3` | Download retry attempts |
| `download.maxConcurrent` | `3` | Simultaneous attachment downloads |
| `download.maxFileSizeMB` | `500` | Skip attachments larger than this |
| `voice.sampleRate` | `48000` | WAV sample rate |
| `voice.silenceThresholdMs` | `1500` | Stop recording after this silence |
| `music.maxQueueSize` | `200` | Maximum tracks in queue |
| `music.leaveOnFinishMs` | `30000` | Auto-leave delay after queue ends |

---

## Troubleshooting

**Bot doesn't respond to commands**
- Ensure `Message Content Intent` is enabled in the Developer Portal.
- Verify the bot has `View Channel` and `Send Messages` permissions in the channel.

**Voice recording produces empty or corrupt WAV files**
- Ensure FFmpeg is installed and accessible in your system PATH.
- The `@discordjs/opus` or `opusscript` package must be installed. Run `npm install` again.

**Slash commands not showing up**
- Global commands can take up to 1 hour to propagate. Use `GUILD_ID=your_id node src/scripts/deployCommands.js` for instant registration.
- Ensure the bot has `Use Application Commands` permission in the server.

**Scrape is slow**
- This is intentional. The 1.2-second delay between batches of 100 messages prevents Discord API rate limits. Do not lower it aggressively.

**Spotify URLs not working**
- Add `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` to your `.env`. Get them from [developer.spotify.com](https://developer.spotify.com/dashboard).

**"Access Denied" on archive commands**
- Add your user ID to `config/allowlist.json` or use `.allowuser <your_id>` if you are the bot owner.

---

## Project Structure

```
/
├── index.js                    — Entry point, bootstrap
├── .env.example                — Environment variable template
├── config/
│   ├── config.json             — Bot configuration
│   └── allowlist.json          — Persistent allowlist storage
└── src/
    ├── commands/
    │   ├── archiver/           — .scrape .channeltrack .ignorechannel .export .search .stats .storage .backup .purgecache
    │   ├── voice/              — .joinvc .dc
    │   ├── access/             — .allowuser .removeallowuser .allowlist .serverinfo .announce
    │   ├── general/            — .ping .cmds
    │   └── music/              — /play /skip /stop /pause /resume /nowplaying /queue /clearqueue
    ├── events/                 — ready messageCreate messageUpdate messageDelete interactionCreate
    ├── handlers/               — commandHandler eventHandler
    ├── services/               — archiverService downloadService exportService metadataService searchService storageService voiceRecorder musicPlayer
    ├── database/               — database.js (SQLite schema + init)
    ├── utils/                  — logger config allowlist permissions helpers hash asyncQueue
    └── scripts/                — deployCommands.js initPlayDl.js
```

---

## License

MIT — use freely, attribution appreciated.
