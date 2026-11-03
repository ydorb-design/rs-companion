# RS Companion

A self-hosted Old School RuneScape companion you run in Docker and open in a browser.

- **Overview and skill pages**: levels, XP and rank from the official hiscores, XP history, gains, average XP per day and time to the next level or 99 at your current pace
- **Bossing**: kill counts, clue scrolls, collection log and minigames, with gains and history
- **Goals**: target a level or XP amount, see XP remaining, and actions or hours left if you add your rates; max cape progress with a rough time to max
- **Quests and diaries**: progress synced from WikiSync, quest requirements from the OSRS Wiki checked against your stats, combat achievements and music track unlocks
- **Timers**: herb, birdhouse, tree and daily reset timers, with alerts when they finish
- **Tasks**: a To do / Doing / Done board, with ironman unlock and gear checklists to start from
- **Guides**: checklists that tick off from your stats, WikiSync, collection log, kill counts and Slayer points
  - **Iron guide**: key ironman quests, gear, items, skill unlocks and diaries, each with why it matters
  - **Quest order**: the OSRS Wiki's ironman quest route, loaded live from the wiki, with its training steps and notes
  - **Diary route**: every diary tier with its rewards, and whether you have the levels and quests for it
  - **Skill training**, **bossing ladder**, **Slayer unlocks**, **money making** and **farming runs**
- **Prices**: live Grand Exchange prices, high alch values, alch profit and a watchlist
- **Alerts**: Discord or ntfy messages when a timer finishes, you level up, or you complete a goal
- **Activity feed**: level-ups, kill count milestones, quests, diaries, drops and Slayer tasks in one timeline
- **What's next** on the Overview: ready timers, unfinished dailies, your Slayer task, quests you can start and your closest goals
- **Slayer**: current task with a kill counter, points and task history
- **Boss notes**: gear, inventory and strategy per boss, next to your kill count, drops and collection log list for it
- **Supplies**: stockpile counts with targets and low-stock warnings
- **Loot by source**: GP per kill and per hour for each boss you've logged drops from
- **Rare drop odds**: on each boss page, your chance of having had each rare drop and pet by now, from the wiki drop rate and your kill count
- **Search** across quests, bosses, skills, guides, items, tasks and your lists (press `/` on desktop)
- **Drops and collection log**: log drops with their GE value; keep a list of collection log items you're chasing, ticked off automatically when you log the drop; see how dry you are on each one, from the wiki's drop rate and your kill count
- **Sessions**: start a session when you log in and end it when you stop, to see the XP and XP per hour, kill counts and loot from that sitting, with a history of past sessions. With Dink, sessions start and end on their own when you log in and out
- **Compare**: line your skills, kill counts and clues up against any player on the hiscores, and save friends to compare with in one tap
- **Calculators**: combat level, with how many levels you need in each stat for the next one, and XP to a target level with actions and hours left
- **Daily and weekly checklist**: your own recurring jobs, reset at the game's daily (00:00 UTC) and weekly (Wednesday 00:00 UTC) reset
- **Multiple accounts**, optional **password login**, **backup and restore**, **light and dark themes**, and it can be **installed to your phone's home screen**

It only reads public data (hiscores, OSRS Wiki). It never touches the game client, so it doesn't break Jagex's rules.

## Run it

Every push to `main` builds a Docker image and publishes it to `ghcr.io/ydorb-design/rs-companion:latest`. The image is private, so the server needs a GitHub token to pull it.

### Unraid (Docker tab)

**Docker > Add Container**, switch to **Advanced View**, then fill in:

| Field | Value |
| --- | --- |
| Name | `rs-companion` |
| Repository | `ghcr.io/ydorb-design/rs-companion:latest` |
| Network Type | `Bridge` |
| WebUI | `http://[IP]:[PORT:8417]/` |
| Icon URL | `https://oldschool.runescape.wiki/images/Stats_icon.png` |

Then **Add another Path, Port, Variable, Label or Device** for each of these:

| Config Type | Name | Container | Host / Value |
| --- | --- | --- | --- |
| Port | WebUI | `8417` | `8417` |
| Path | Data | `/data` | `/mnt/user/appdata/rs-companion` |

Click **Apply**. Open the WebUI, go to **Settings**, and add your player name and account type under Accounts. It pulls your stats straight away.

**Updates**: Unraid shows "update ready" on the Docker tab when a new image is published, same as your other containers.

**Backups**: all data is in `/mnt/user/appdata/rs-companion`, so the Appdata Backup plugin covers it.

### Password login

The app has no login unless you turn it on. In the Docker tab, edit the container and **Add another Path, Port, Variable, Label or Device**:

| Config Type | Name | Key | Value |
| --- | --- | --- | --- |
| Variable | Password | `APP_PASSWORD` | your password |

Apply, and the app will ask for it. You stay signed in for 90 days per device. Changing the password signs everyone out.

### Alerts

In the app, go to **Settings > Refresh and alerts** and paste a Discord webhook URL (Discord: Server Settings > Integrations > Webhooks > New Webhook > Copy Webhook URL) and/or an ntfy topic URL. Press **Send test alert** to check it works.

Level-up and goal alerts are sent when the app next refreshes your stats, so they can arrive up to the refresh interval after it happens.

### Phone

Open the app's address in your phone browser and use **Add to Home Screen** (Safari: Share menu; Chrome: menu). It opens full screen like an app. This needs the HTTPS address through Nginx Proxy Manager, not the local IP.

### Nginx Proxy Manager and Cloudflare

Add a Proxy Host pointing to your Unraid IP, port `8417`, scheme `http`.

Once it's reachable from the internet, anyone with the address can see and change your data unless it's protected. Turn on password login (above), and/or put it behind one of these:

- **Cloudflare Access** (Zero Trust > Access > Applications): only lets in your email address. Best option if the domain is proxied through Cloudflare.
- **NPM Access List**: Access Lists > Add, set a username and password, then pick it on the Proxy Host.

### Docker Compose (other servers)

```sh
git clone https://github.com/ydorb-design/rs-companion.git
cd rs-companion
docker compose up -d --build
```

Open `http://<server-ip>:8417`. Data is stored in the `data` folder next to `docker-compose.yml`.

## Quest and diary sync

Quest and diary progress comes from the OSRS Wiki's **WikiSync** RuneLite plugin.

1. In RuneLite, open the Plugin Hub and install **WikiSync**
2. Log in to the game once
3. In the app, open **Quests & diaries** and press **Sync from WikiSync**

After that it syncs automatically on the refresh interval. Anything you change by hand is kept as an override (dashed outline on diaries, "Manual" tag on quests) until you clear it.

## RuneLite (Dink)

Install the [Dink](https://github.com/pajlads/DinkPlugin) plugin from the RuneLite Plugin Hub and point it at the app, and drops, collection log slots, Slayer tasks, kill counts and personal bests, quests, diaries, combat tasks, clues, pets and level-ups arrive as you play.

Turn on Dink's login and logout notifications too, and sessions start when you log in and end when you log out. The login message also updates your Slayer points, quest points, collection log count, combat task points and pets. A session's end numbers come from the hiscores about 3 minutes after you log out, so they've caught up. You can turn automatic sessions off in **Settings > RuneLite (Dink)**.

The app's address for Dink, and step-by-step setup, are in **Settings > RuneLite (Dink)**. The address contains a secret, so keep it private; you can make a new one there if it leaks. Recent messages are listed under it to help check the setup.

Dink only sends drops above its **Min Loot value**, and new collection log slots need the in-game setting **Collection log - New addition notification** turned on.

## Quest requirements

When you sync, the app reads each quest's requirements from its OSRS Wiki page and checks them against your levels and quest progress. Results are cached for 30 days; **Reload requirements** fetches them again.

- Skill, combat level and quest requirements are checked. Quest point requirements are checked once Dink has reported your quest points (it sends them with each quest you complete).
- If a quest page can't be read, it shows "Requirements not found on the wiki" rather than guessing.

## Collection log

The game's full collection log isn't on the hiscores, only the number of slots logged, which the app shows. The list on the Collection log page is one you build yourself.

## How tracking works

- Boss kill counts only show once you're ranked for that boss on the hiscores.
- The activity feed dates hiscores events (levels, kill counts) by when the app noticed them, so they can be up to the refresh interval late.
- The hiscores only show current totals, so history builds up from snapshots the app takes. The default is every 6 hours (change it in Settings). The first day's chart will be empty.
- Your skills need to be ranked on the hiscores to show exact XP. Unranked skills show the minimum XP for their level.
- Group ironmen are read from the main hiscores, as there isn't an individual group ironman board.

## Development

Needs Node 22.13 or later.

```sh
npm install
npm start      # http://localhost:8417
npm test
```

Data sources: [OSRS hiscores](https://secure.runescape.com/m=hiscore_oldschool/overall), [OSRS Wiki real-time prices](https://oldschool.runescape.wiki/w/RuneScape:Real-time_Prices), [WikiSync](https://oldschool.runescape.wiki/w/RuneScape:WikiSync).
