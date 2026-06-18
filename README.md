# Husky FX Watcher

A Chrome (Manifest V3) extension that watches the latest transfer on
[app.husky.io](https://app.husky.io) and alerts you when the FX rate crosses
thresholds you set — so you can act on a good rate without babysitting the tab.

It opens the most recent transfer's drawer roughly once a minute to pull a fresh
quote, reads the rate / spread / total, and evaluates it against your settings.
The page is reloaded every five minutes to catch list changes. Optionally it can
auto-confirm a withdrawal when a threshold is hit (off by default, double-gated).

## Features

- **Rate thresholds** — alert when the rate drops below or rises above a value.
- **Percent-change alerts** — alert on an N% move from the last notified rate.
- **Heartbeat** — optional "notify every N minutes" ping.
- **Daily high / low** — tracks the day's best and worst observed rate.
- **Auto-confirm (optional)** — confirm the withdrawal automatically when a
  threshold is crossed. Disabled by default and requires an explicit
  "I understand this is irreversible" acknowledgement before it will fire.
- **Audible alert** — a short chime via an offscreen document; mutable, with a
  "play test sound" button in the popup.
- **Force refresh** — a popup button to reload the transfers tab on demand.

All thresholds and preferences live in `chrome.storage.local`. Nothing about your
account, amounts, or rates is hardcoded — everything is read live from the page
while you're logged in. The toolbar icon is a purple **H** on white.

## Install (unpacked)

1. Open `chrome://extensions`, enable **Developer mode**.
2. Click **Load unpacked** and select this folder.
3. Log in to app.husky.io, open the transfers page, then set your thresholds in
   the extension popup. Leave the tab open for it to keep checking.

> The icons are already generated and committed — nothing to build. You only
> need `generate_icons.py` if you want to change the icon design.

## How it works

A content script runs on the transfers page. Once a minute it closes any open
drawer, opens the most recent transfer's drawer (which triggers a fresh
server-side quote), waits for the quote to populate, then reads the rate, spread,
and totals. It evaluates that reading against your thresholds and fires at most
one notification per tick — threshold crossing takes priority, then percent
change, then the heartbeat. The whole page reloads every five minutes to catch
list changes. If auto-confirm is enabled **and** acknowledged, a threshold
crossing clicks the confirm button once for that transfer.

## Files

| File | Role |
| --- | --- |
| `manifest.json` | MV3 manifest, permissions, host match for app.husky.io |
| `content.js` | In-page loop: open drawer, read quote, evaluate, optional auto-confirm |
| `background.js` | Service worker: notifications + offscreen audio |
| `popup.html` / `popup.js` | Settings UI + last reading / daily stats |
| `offscreen.html` / `offscreen.js` | Plays the alert chime |
| `generate_icons.py` | Regenerates the committed icons — optional (pure stdlib) |

## Notes

Personal utility, not affiliated with or endorsed by Husky. The auto-confirm
feature sends a real, irreversible withdrawal — use it deliberately.
