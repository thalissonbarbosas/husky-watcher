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
- **Audible alert** — a short chime via an offscreen document; mutable.

All thresholds and preferences live in `chrome.storage.local`. Nothing about your
account, amounts, or rates is hardcoded — everything is read live from the page
while you're logged in.

## Install (unpacked)

1. Run `python3 generate_icons.py` once to (re)create the icons (optional — icons
   are committed). Pure stdlib, no dependencies.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Log in to app.husky.io, open the transfers page, then set your thresholds in
   the extension popup. Leave the tab open for it to keep checking.

## Files

| File | Role |
| --- | --- |
| `manifest.json` | MV3 manifest, permissions, host match for app.husky.io |
| `content.js` | In-page loop: open drawer, read quote, evaluate, optional auto-confirm |
| `background.js` | Service worker: notifications + offscreen audio |
| `popup.html` / `popup.js` | Settings UI + last reading / daily stats |
| `offscreen.html` / `offscreen.js` | Plays the alert chime |
| `generate_icons.py` | Generates placeholder icons (pure stdlib) |

## Notes

Personal utility, not affiliated with or endorsed by Husky. The auto-confirm
feature sends a real, irreversible withdrawal — use it deliberately.
