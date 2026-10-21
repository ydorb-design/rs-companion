# OSRS Companion

A self-hosted Old School RuneScape companion you run in Docker and open in a browser.

- **Overview**: levels and XP from the official hiscores, XP chart per skill, gains by day, week and month
- **Goals**: target a level or XP amount, see XP remaining, and actions or hours left if you add your rates
- **Quests and diaries**: quest and achievement diary progress synced from WikiSync, with manual overrides
- **Prices**: live Grand Exchange prices, high alch values, alch profit and a watchlist
- **Tasks**: a simple To do / Doing / Done board for your own objectives

It only reads public data (hiscores, OSRS Wiki). It never touches the game client, so it doesn't break Jagex's rules.

## Run it

You need Docker with Compose. On a NAS that's usually Container Manager (Synology), Portainer, or the Docker app on Unraid.

```sh
git clone https://github.com/ydorb-design/rs-companion.git
cd rs-companion
docker compose up -d --build
```

Open `http://<server-ip>:3000`, go to **Settings**, enter your player name and account type, and save. It pulls your stats straight away.

Your data is stored in the `data` folder next to `docker-compose.yml`. Back that folder up to keep your history.

**Update** to a newer version:

```sh
git pull
docker compose up -d --build
```

**Change the port**: edit `"3000:3000"` in `docker-compose.yml` to e.g. `"8080:3000"`.

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
npm start      # http://localhost:3000
npm test
```

Data sources: [OSRS hiscores](https://secure.runescape.com/m=hiscore_oldschool/overall), [OSRS Wiki real-time prices](https://oldschool.runescape.wiki/w/RuneScape:Real-time_Prices), [WikiSync](https://oldschool.runescape.wiki/w/RuneScape:WikiSync).
