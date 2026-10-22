# OSRS Companion

A self-hosted Old School RuneScape companion you run in Docker and open in a browser.

- **Overview**: levels and XP from the official hiscores, XP chart per skill, gains by day, week and month
- **Goals**: target a level or XP amount, see XP remaining, and actions or hours left if you add your rates
- **Quests and diaries**: quest and achievement diary progress synced from WikiSync, with manual overrides
- **Prices**: live Grand Exchange prices, high alch values, alch profit and a watchlist
- **Tasks**: a simple To do / Doing / Done board for your own objectives

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

Click **Apply**. Open the WebUI, go to **Settings**, enter your player name and account type, and save. It pulls your stats straight away.

**Updates**: Unraid shows "update ready" on the Docker tab when a new image is published, same as your other containers.

**Backups**: all data is in `/mnt/user/appdata/rs-companion`, so the Appdata Backup plugin covers it.

### Nginx Proxy Manager and Cloudflare

Add a Proxy Host pointing to your Unraid IP, port `8417`, scheme `http`.

The app has no login. If it's reachable from the internet, anyone with the address can see and change your data. Put it behind one of these:

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

## How tracking works

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
