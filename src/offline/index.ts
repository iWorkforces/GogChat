((window: Window) => {
  // eslint-disable-next-line no-restricted-syntax -- offline page cannot import from shared/
  const btn = window.document.getElementById('retry-btn') as HTMLButtonElement;
  const MAX_AUTO_ATTEMPT_COUNT = 100;
  let attemptCount = 0;
  let interval: NodeJS.Timeout;

  const restoreRetryState = () => {
    btn.disabled = false;
    btn.innerText = 'Retry';
  };

  const checkIsOnline = () => {
    if (attemptCount > MAX_AUTO_ATTEMPT_COUNT) {
      clearInterval(interval);
    }

    btn.disabled = true;
    btn.innerText = 'Checking...';

    // This script does not have access to Electron APIs (IPC)
    // So let's notify the preload script via a global event
    window.dispatchEvent(new Event('app:checkIfOnline'));
    attemptCount++;
  };

  // Preload signals failed checks via DOM event so we re-enable retry without
  // reloading the offline document.
  window.addEventListener('app:onlineCheckFailed', restoreRetryState);

  btn.addEventListener('click', checkIsOnline);
  interval = setInterval(checkIsOnline, 1000 * 60);
})(window);
