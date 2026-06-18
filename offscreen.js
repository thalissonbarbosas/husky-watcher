chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'playSound') {
    playAlertSound();
  }
  // No-op for stopSound: this chime is short and single-shot.
});

function playAlertSound() {
  const ctx = new AudioContext();
  // Soft two-tone chime — pleasant, not alarming. "Bing-bong."
  const notes = [
    { freq: 880, when: 0.0, dur: 0.22 },
    { freq: 660, when: 0.25, dur: 0.35 },
  ];

  notes.forEach(({ freq, when, dur }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);

    const start = ctx.currentTime + when;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  });
}
