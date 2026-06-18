// In-page orchestrator for Husky FX Watcher.
// Runs every minute: close any open drawer, click the ready-to-close row, read
// spread + total from the drawer, evaluate against thresholds, optionally
// auto-confirm. Every five minutes the page reloads (a fresh quote is fetched
// server-side on each row click, but we reload to catch list changes too).

const TICK_MS = 60 * 1000;
const RELOAD_MS = 5 * 60 * 1000;
const MODAL_WAIT_MS = 8000;
const QUOTE_WAIT_MS = 10000;
const MODAL_POLL_MS = 200;

const SEL = {
  readyRow: 'tr.send-money-transactions-table__tr--payment-ready-to-close',
  openLink: 'a[href^="/confirmar-saque/"]',
  drawer: '#send-money-transaction-drawer',
  drawerOpen: '#send-money-transaction-drawer.show',
  // The X button — Husky's modal also dismisses on backdrop click, but we MUST
  // only ever use this button so we never simulate a backdrop click.
  closeBtn: '#send-money-transaction-drawer .close-icon[data-dismiss="modal"]',
  backdrop: '.modal-backdrop',
  rate: '.send-money__quote-rate',
  total: '.send-money__quote-payment-value',
  original: '.send-money__quote-payment-original-value',
  discountRow: '.send-money-transaction-receipt-table__row',
  confirmForm: 'form[action$="/processar"]',
  confirmBtn: 'form[action$="/processar"] button[type="submit"]',
};

const log = (...args) => console.log('[husky-watcher]', ...args);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(selector, timeoutMs = MODAL_WAIT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const el = document.querySelector(selector);
    if (el) return el;
    await sleep(MODAL_POLL_MS);
  }
  return null;
}

async function waitForGone(selector, timeoutMs = MODAL_WAIT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!document.querySelector(selector)) return true;
    await sleep(MODAL_POLL_MS);
  }
  return false;
}

function parseNumber(str) {
  if (!str) return null;
  // Strip currency labels and whitespace, then handle pt-BR vs en-US separators.
  const cleaned = str.replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized = cleaned;
  if (lastComma > lastDot) {
    // pt-BR: 1.234,56
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    // en-US: 1,234.56
    normalized = cleaned.replace(/,/g, '');
  }
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

function readModal() {
  const rateEl = document.querySelector(SEL.rate);
  const totalEl = document.querySelector(SEL.total);
  const originalEl = document.querySelector(SEL.original);

  let discountPct = null;
  for (const row of document.querySelectorAll(SEL.discountRow)) {
    const label = row.children?.[0]?.textContent?.trim().toLowerCase();
    if (label && label.startsWith('descontamos')) {
      const m = row.children?.[1]?.textContent?.match(/([\d.,]+)\s*%/);
      if (m) discountPct = parseNumber(m[1]);
      break;
    }
  }

  return {
    rate: parseNumber(rateEl?.textContent),
    totalBRL: parseNumber(totalEl?.textContent),
    totalBRLText: totalEl?.textContent?.trim() ?? null,
    originalUSD: originalEl?.getAttribute('data-value-to-decimal')
      ? parseFloat(originalEl.getAttribute('data-value-to-decimal'))
      : parseNumber(originalEl?.textContent),
    originalUSDText: originalEl?.textContent?.trim() ?? null,
    spreadPct: discountPct,
  };
}

async function closeDrawerIfOpen() {
  // Only close via the X. Never simulate a click outside the modal — Bootstrap
  // treats that as a backdrop dismiss and the user has flagged that as bad UX.
  const open = document.querySelector(SEL.drawerOpen);
  const backdropPresent = !!document.querySelector(SEL.backdrop);
  if (!open && !backdropPresent) return;

  const closeBtn = document.querySelector(SEL.closeBtn);
  if (closeBtn) {
    closeBtn.click();
  } else {
    log('no X button found to close drawer');
  }

  // Wait for BOTH the .show class to drop AND Bootstrap's backdrop element to be
  // removed. Bootstrap leaves the backdrop in the DOM during its fade animation,
  // and if we open a new modal too early the stale backdrop can intercept clicks.
  await waitForGone(SEL.drawerOpen, 5000);
  await waitForGone(SEL.backdrop, 5000);

  // A small extra settle lets Bootstrap finish removing the body.modal-open class
  // and any lingering inline styles before we reopen.
  await sleep(400);
}

async function openDrawer() {
  const row = document.querySelector(SEL.readyRow);
  if (!row) return { ok: false, reason: 'no-ready-row' };
  const link = row.querySelector(SEL.openLink);
  if (!link) return { ok: false, reason: 'no-open-link' };

  const paymentId = row.getAttribute('data-payment-id') || null;
  link.click();

  // Wait for the drawer DOM to render its rate node (still empty at this point).
  const rateEl = await waitFor(SEL.rate, MODAL_WAIT_MS);
  if (!rateEl) return { ok: false, reason: 'modal-timeout', paymentId };

  // Wait for the /cotacao XHR to populate real numbers into the DOM.
  const ready = await waitForQuote(QUOTE_WAIT_MS);
  if (!ready) return { ok: false, reason: 'quote-timeout', paymentId };

  return { ok: true, paymentId };
}

async function waitForQuote(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = parseNumber(document.querySelector(SEL.rate)?.textContent);
    const t = parseNumber(document.querySelector(SEL.total)?.textContent);
    if (r != null && r > 0 && t != null && t > 0) return true;
    await sleep(MODAL_POLL_MS);
  }
  return false;
}

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      {
        rateBelow: null,
        rateAbove: null,
        notifyEveryMinutes: null,
        notifyOnPctChange: null,
        lastHeartbeatAt: 0,
        lastNotifiedRate: null,
        autoConfirm: false,
        autoConfirmAcknowledged: false,
        muted: false,
        confirmedPaymentId: null,
      },
      resolve
    );
  });
}

function setState(patch) {
  return new Promise((resolve) => chrome.storage.local.set(patch, resolve));
}

function evaluate(reading, settings) {
  const { rateBelow, rateAbove } = settings;
  const r = reading.rate;
  if (r == null) return { triggered: false };

  if (rateBelow != null && r <= rateBelow) {
    return { triggered: true, direction: 'below', threshold: rateBelow };
  }
  if (rateAbove != null && r >= rateAbove) {
    return { triggered: true, direction: 'above', threshold: rateAbove };
  }
  return { triggered: false };
}

function fmtBRL(n) {
  if (n == null) return '—';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function updateDayStats(rate, time) {
  if (rate == null || !(rate > 0)) {
    const { dayStats } = await new Promise((r) =>
      chrome.storage.local.get({ dayStats: null }, r)
    );
    return dayStats;
  }
  const today = todayKey();
  const { dayStats } = await new Promise((r) =>
    chrome.storage.local.get({ dayStats: null }, r)
  );
  if (!dayStats || dayStats.date !== today) {
    return {
      date: today,
      high: { rate, time },
      low: { rate, time },
    };
  }
  const next = { ...dayStats };
  if (rate > next.high.rate) next.high = { rate, time };
  if (rate < next.low.rate) next.low = { rate, time };
  return next;
}

let tickInFlight = false;

async function tick() {
  if (tickInFlight) {
    log('tick already in flight, skipping');
    return;
  }
  tickInFlight = true;
  try {
    const settings = await getSettings();
    await closeDrawerIfOpen();

    const opened = await openDrawer();
    const time = new Date().toLocaleTimeString('pt-BR');

    if (!opened.ok) {
      log('skip tick:', opened.reason);
      await setState({
        lastCheck: { time, ok: false, reason: opened.reason },
      });
      chrome.runtime.sendMessage({ type: 'tick', ok: false, reason: opened.reason, time }).catch(() => {});
      return;
    }

    const reading = readModal();
    log('reading', reading);

    const dayStats = await updateDayStats(reading.rate, time);

    await setState({
      lastCheck: { time, ok: true, paymentId: opened.paymentId, ...reading },
      dayStats,
    });
    chrome.runtime
      .sendMessage({ type: 'tick', ok: true, time, paymentId: opened.paymentId, dayStats, ...reading })
      .catch(() => {});

    const rateLabel = reading.rate != null ? reading.rate.toString() : '—';
    const totalLabel = reading.totalBRL != null ? fmtBRL(reading.totalBRL) : (reading.totalBRLText || '—');
    const msg = `R$ ${rateLabel}: R$ ${totalLabel}`;

    const verdict = evaluate(reading, settings);

    // Priority for notifications, only one fires per tick:
    //   1. Threshold crossed (rateBelow/rateAbove)
    //   2. Percent-change vs last notified rate exceeded notifyOnPctChange
    //   3. Heartbeat: notifyEveryMinutes elapsed since last heartbeat
    let fired = null;

    if (verdict.triggered) {
      const arrow = verdict.direction === 'below' ? '↓' : '↑';
      fired = { title: `${arrow} Husky`, direction: verdict.direction };
    } else if (
      reading.rate != null &&
      settings.notifyOnPctChange != null &&
      settings.notifyOnPctChange > 0 &&
      settings.lastNotifiedRate != null &&
      settings.lastNotifiedRate > 0
    ) {
      const deltaPct = ((reading.rate - settings.lastNotifiedRate) / settings.lastNotifiedRate) * 100;
      if (Math.abs(deltaPct) >= settings.notifyOnPctChange) {
        const sign = deltaPct >= 0 ? '+' : '−';
        const arrow = deltaPct >= 0 ? '↑' : '↓';
        fired = {
          title: `${arrow} ${sign}${Math.abs(deltaPct).toFixed(2)}% Husky`,
          direction: 'pct-change',
        };
      }
    }

    if (!fired &&
        settings.notifyEveryMinutes != null &&
        settings.notifyEveryMinutes > 0 &&
        reading.rate != null) {
      const elapsedMs = Date.now() - (settings.lastHeartbeatAt || 0);
      if (elapsedMs >= settings.notifyEveryMinutes * 60 * 1000) {
        fired = { title: 'Husky', direction: 'heartbeat' };
      }
    }

    if (fired) {
      const patch = { lastNotifiedRate: reading.rate };
      if (fired.direction === 'heartbeat') patch.lastHeartbeatAt = Date.now();
      // Seed the baseline on the first qualifying read so we don't ping immediately.
      await setState(patch);
      chrome.runtime
        .sendMessage({
          type: 'alert',
          direction: fired.direction,
          muted: settings.muted,
          title: fired.title,
          message: msg,
        })
        .catch(() => {});
    } else if (settings.lastNotifiedRate == null && reading.rate != null) {
      // Establish the baseline silently so the first pct-change comparison
      // measures from this point, not from null.
      await setState({ lastNotifiedRate: reading.rate });
    }

    // Auto-confirm is gated on the threshold verdict only.
    if (!verdict.triggered) return;

    if (
      settings.autoConfirm &&
      settings.autoConfirmAcknowledged &&
      settings.confirmedPaymentId !== opened.paymentId
    ) {
      const btn = document.querySelector(SEL.confirmBtn);
      if (btn) {
        log('AUTO-CONFIRM firing for payment', opened.paymentId);
        await setState({
          confirmedPaymentId: opened.paymentId,
          lastConfirm: { time, paymentId: opened.paymentId, ...reading, direction: verdict.direction },
        });
        btn.click();
        chrome.runtime
          .sendMessage({
            type: 'auto-confirmed',
            paymentId: opened.paymentId,
            time,
            reading,
          })
          .catch(() => {});
        // Stop further ticks this page-life — the row state will change after reload.
        stopTicking();
      } else {
        log('auto-confirm wanted but no confirm button found');
      }
    }
  } catch (e) {
    log('tick error', e);
  } finally {
    tickInFlight = false;
  }
}

let tickHandle = null;
let reloadHandle = null;

function startTicking() {
  if (tickHandle) return;
  // Run once shortly after page load, then every minute.
  setTimeout(tick, 1500);
  tickHandle = setInterval(tick, TICK_MS);
  reloadHandle = setTimeout(() => {
    log('5-min reload');
    location.reload();
  }, RELOAD_MS);
}

function stopTicking() {
  if (tickHandle) clearInterval(tickHandle);
  if (reloadHandle) clearTimeout(reloadHandle);
  tickHandle = null;
  reloadHandle = null;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.action === 'forceTick') {
    tick().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.action === 'forceReload') {
    location.reload();
    sendResponse({ ok: true });
  }
});

log('content script loaded; starting watcher loop');
startTicking();
