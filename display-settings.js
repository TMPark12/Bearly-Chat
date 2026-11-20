function applyDisplaySettings() {
  try {
    const stored = localStorage.getItem('bearly-chat-settings') ?? localStorage.getItem('toddle-cation-settings');
    const settings = stored === null ? {} : JSON.parse(stored);
    for (const [key, className] of [['largeText', 'large-text'], ['contrast', 'high-contrast'], ['reduceMotion', 'reduce-motion']]) {
      document.documentElement.classList.toggle(className, settings?.[key] === true);
    }
  } catch (error) {
    console.error('Unable to read display settings:', error);
  }
}

applyDisplaySettings();
window.addEventListener('storage', event => {
  if (event.key === null || event.key === 'bearly-chat-settings' || event.key === 'toddle-cation-settings') applyDisplaySettings();
});
