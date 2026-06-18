const $ = (id) => document.getElementById(id);

const els = {
  dot: $('dot'),
  lastTime: $('last-time'),
  rSpread: $('r-spread'),
  rRate: $('r-rate'),
  rUsd: $('r-usd'),
  rBrl: $('r-brl'),
  dHigh: $('d-high'),
  dLow: $('d-low'),
  rateBelow: $('rate-below'),
  rateAbove: $('rate-above'),
  notifyEvery: $('notify-every'),
  notifyPct: $('notify-pct'),
  muted: $('muted'),
  autoConfirm: $('auto-confirm'),
  autoConfirmAck: $('auto-confirm-ack'),
  saveBtn: $('save-btn'),
  previewBtn: $('preview-btn'),
  reloadBtn: $('reload-btn'),
};

function renderLastCheck(lc) {
  if (!lc) {
    els.dot.className = 'status-dot';
    els.lastTime.textContent = 'Sem leitura ainda.';
    return;
  }
  if (!lc.ok) {
    els.dot.className = 'status-dot warn';
    els.lastTime.textContent = `${lc.time} · ${lc.reason || 'erro'}`;
    return;
  }
  els.dot.className = 'status-dot ok';
  els.lastTime.textContent = `Última leitura: ${lc.time}`;
  els.rSpread.textContent = lc.spreadPct != null ? `${lc.spreadPct} %` : '—';
  els.rRate.textContent = lc.rate != null ? lc.rate.toString() : '—';
  els.rUsd.textContent = lc.originalUSDText || (lc.originalUSD != null ? `$ ${lc.originalUSD}` : '—');
  els.rBrl.textContent = lc.totalBRLText || (lc.totalBRL != null ? lc.totalBRL.toString() : '—');
}

function renderDayStats(ds) {
  function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  if (!ds || ds.date !== todayKey()) {
    els.dHigh.textContent = '—';
    els.dLow.textContent = '—';
    return;
  }
  els.dHigh.textContent = `R$ ${ds.high.rate} · ${ds.high.time}`;
  els.dLow.textContent = `R$ ${ds.low.rate} · ${ds.low.time}`;
}

function loadSettings() {
  chrome.storage.local.get(
    {
      rateBelow: null,
      rateAbove: null,
      notifyEveryMinutes: null,
      notifyOnPctChange: null,
      muted: false,
      autoConfirm: false,
      autoConfirmAcknowledged: false,
      lastCheck: null,
      dayStats: null,
    },
    (data) => {
      els.rateBelow.value = data.rateBelow ?? '';
      els.rateAbove.value = data.rateAbove ?? '';
      els.notifyEvery.value = data.notifyEveryMinutes ?? '';
      els.notifyPct.value = data.notifyOnPctChange ?? '';
      els.muted.checked = !!data.muted;
      els.autoConfirm.checked = !!data.autoConfirm;
      els.autoConfirmAck.checked = !!data.autoConfirmAcknowledged;
      renderLastCheck(data.lastCheck);
      renderDayStats(data.dayStats);
    }
  );
}

function parseOptionalFloat(s) {
  if (s == null || s === '') return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

els.saveBtn.addEventListener('click', () => {
  const patch = {
    rateBelow: parseOptionalFloat(els.rateBelow.value),
    rateAbove: parseOptionalFloat(els.rateAbove.value),
    notifyEveryMinutes: parseOptionalFloat(els.notifyEvery.value),
    notifyOnPctChange: parseOptionalFloat(els.notifyPct.value),
    muted: els.muted.checked,
    autoConfirm: els.autoConfirm.checked,
    autoConfirmAcknowledged: els.autoConfirmAck.checked,
  };
  // If they unchecked the ack, force-disable auto-confirm too.
  if (!patch.autoConfirmAcknowledged) patch.autoConfirm = false;
  chrome.storage.local.set(patch, () => {
    els.saveBtn.textContent = 'Salvo ✓';
    setTimeout(() => (els.saveBtn.textContent = 'Salvar'), 1200);
    // Reflect any auto-disable.
    els.autoConfirm.checked = patch.autoConfirm;
  });
});

els.previewBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'previewSound' });
});

els.reloadBtn.addEventListener('click', () => {
  chrome.tabs.query({ url: 'https://app.husky.io/transferencias*' }, (tabs) => {
    if (!tabs[0]) {
      chrome.tabs.create({ url: 'https://app.husky.io/transferencias' });
      return;
    }
    chrome.tabs.reload(tabs[0].id);
  });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'tick') {
    const lc = msg.ok
      ? {
          time: msg.time,
          ok: true,
          spreadPct: msg.spreadPct,
          rate: msg.rate,
          originalUSD: msg.originalUSD,
          originalUSDText: msg.originalUSDText,
          totalBRL: msg.totalBRL,
          totalBRLText: msg.totalBRLText,
        }
      : { time: msg.time, ok: false, reason: msg.reason };
    renderLastCheck(lc);
    if (msg.dayStats) renderDayStats(msg.dayStats);
  }
});

loadSettings();
