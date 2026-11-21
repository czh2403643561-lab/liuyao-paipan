export function enableAppUpdates(canReload: () => boolean) {
  const version = document.querySelector<HTMLMetaElement>('meta[name="app-version"]')?.content;
  if (!version) return;

  const workers = navigator.serviceWorker;
  let registration: ServiceWorkerRegistration | undefined;
  let checking = false;
  let updateReady = false;
  let reloadTimer: number | undefined;
  let lastInteraction = 0;

  function reloadWhenIdle() {
    if (!updateReady || reloadTimer !== undefined || document.hidden) return;
    reloadTimer = window.setTimeout(() => {
      reloadTimer = undefined;
      if (document.hidden) return;
      const editing = document.activeElement?.matches('input, textarea, select, [contenteditable]');
      if (canReload() && !editing && Date.now() - lastInteraction >= 1200) {
        window.location.reload();
        return;
      }
      reloadWhenIdle();
    }, 1200);
  }

  function readWorkerVersion() {
    workers.controller?.postMessage({ type: 'GET_APP_VERSION' });
  }

  async function checkForUpdate() {
    if (checking || document.hidden || !navigator.onLine || !registration) return;
    checking = true;
    try {
      await registration.update();
    } catch {
      // Keep using the installed version if the server is unreachable.
    } finally {
      checking = false;
      readWorkerVersion();
    }
  }

  workers.addEventListener('message', event => {
    if (event.source !== workers.controller || event.data?.type !== 'APP_VERSION') return;
    updateReady = typeof event.data.version === 'string' && event.data.version !== version;
    reloadWhenIdle();
  });
  workers.addEventListener('controllerchange', readWorkerVersion);
  for (const event of ['pointerdown', 'keydown', 'input']) {
    document.addEventListener(event, () => { lastInteraction = Date.now(); }, { capture: true, passive: true });
  }
  window.addEventListener('online', checkForUpdate);
  window.addEventListener('pageshow', checkForUpdate);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    reloadWhenIdle();
    void checkForUpdate();
  });

  navigator.serviceWorker.register(new URL('./sw.js', document.baseURI), { updateViaCache: 'none' })
    .then(registered => {
      registration = registered;
      readWorkerVersion();
      void checkForUpdate();
      window.setInterval(checkForUpdate, 15 * 60_000);
    })
    .catch(error => console.warn('离线资源注册失败', error));
}
