// Background service worker for Husky FX Watcher.
// - Receives tick/alert/auto-confirmed events from the content script.
// - Fires Chrome notifications and triggers offscreen audio playback.

const NOTIF_ID = 'husky-fx-alert';
const CONFIRM_NOTIF_ID = 'husky-fx-confirmed';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'alert') {
    chrome.notifications.create(NOTIF_ID, {
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: msg.title || 'Husky FX',
      message: msg.message || '',
      priority: 2,
      requireInteraction: true,
    });
    if (!msg.muted) playAlertSound();
    sendResponse({ ok: true });
    return;
  }

  if (msg?.type === 'auto-confirmed') {
    chrome.notifications.create(CONFIRM_NOTIF_ID, {
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: '🚀 Saque confirmado automaticamente',
      message: `Payment ${msg.paymentId} · ${msg.reading?.totalBRLText ?? ''}`,
      priority: 2,
      requireInteraction: true,
    });
    playAlertSound();
    sendResponse({ ok: true });
    return;
  }

  if (msg?.action === 'stopSound') {
    chrome.runtime.sendMessage({ action: 'stopSound' }).catch(() => {});
    sendResponse({ ok: true });
    return;
  }

  if (msg?.action === 'previewSound') {
    playAlertSound();
    sendResponse({ ok: true });
    return;
  }
});

chrome.notifications.onClicked.addListener((id) => {
  chrome.notifications.clear(id);
  chrome.tabs.query({ url: 'https://app.husky.io/transferencias*' }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.update(tabs[0].id, { active: true });
      if (tabs[0].windowId != null) {
        chrome.windows.update(tabs[0].windowId, { focused: true });
      }
    } else {
      chrome.tabs.create({ url: 'https://app.husky.io/transferencias' });
    }
  });
  chrome.runtime.sendMessage({ action: 'stopSound' }).catch(() => {});
});

async function playAlertSound() {
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['AUDIO_PLAYBACK'],
      justification: 'Play alert chime when the Husky FX spread crosses a threshold.',
    });
  } catch {
    // Already exists — fine.
  }
  chrome.runtime.sendMessage({ action: 'playSound' }).catch(() => {});
}
