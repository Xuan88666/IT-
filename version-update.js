(() => {
  const apiBaseUrl = String(window.__OPSHUB_API_BASE_URL || 'http://8.134.94.184:3000/api').replace(/\/$/, '');
  const fallbackVersion = document.documentElement.dataset.appVersion || '0.0.0';

  function compareVersions(remote, local) {
    const remoteParts = String(remote).replace(/^v/i, '').split(/[.+-]/).map((part) => Number.parseInt(part, 10) || 0);
    const localParts = String(local).replace(/^v/i, '').split(/[.+-]/).map((part) => Number.parseInt(part, 10) || 0);
    const length = Math.max(remoteParts.length, localParts.length);
    for (let index = 0; index < length; index += 1) {
      if ((remoteParts[index] || 0) !== (localParts[index] || 0)) return (remoteParts[index] || 0) > (localParts[index] || 0) ? 1 : -1;
    }
    return 0;
  }

  async function getLocalVersion() {
    try {
      const appApi = window.__TAURI__?.app;
      if (typeof appApi?.getVersion === 'function') return await appApi.getVersion();
      if (typeof window.__TAURI__?.core?.invoke === 'function') return await window.__TAURI__.core.invoke('plugin:app|version');
    } catch { /* Use the packaged fallback version when the optional Tauri API is unavailable. */ }
    return fallbackVersion;
  }

  async function openDownload(url) {
    try {
      if (typeof window.__TAURI__?.shell?.open === 'function') return await window.__TAURI__.shell.open(url);
      if (typeof window.__TAURI__?.core?.invoke === 'function') return await window.__TAURI__.core.invoke('plugin:shell|open', { path: url });
    } catch { /* The browser fallback below keeps the update flow available. */ }
    window.open(url, '_blank', 'noopener');
  }

  function showUpdate(version, updateLog, downloadUrl) {
    const overlay = document.createElement('div');
    overlay.className = 'version-update-overlay';
    overlay.innerHTML = '<section class="version-update-dialog" role="dialog" aria-modal="true" aria-labelledby="version-update-title">'
      + '<div class="version-update-heading"><span class="version-update-mark">UP</span><div><p>软件更新</p><h2 id="version-update-title"></h2></div></div>'
      + '<pre class="version-update-log"></pre>'
      + '<div class="version-update-actions"><button type="button" class="version-update-later">稍后提醒</button><button type="button" class="version-update-now">立即更新</button></div>'
      + '</section>';
    overlay.querySelector('#version-update-title').textContent = `发现新版本 V${version}`;
    overlay.querySelector('.version-update-log').textContent = updateLog;
    overlay.querySelector('.version-update-later').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.version-update-now').addEventListener('click', () => openDownload(downloadUrl));
    document.body.append(overlay);
  }

  async function checkForUpdate() {
    try {
      const [localVersion, response] = await Promise.all([
        getLocalVersion(),
        fetch(`${apiBaseUrl}/version/latest`, { method: 'GET', headers: { Accept: 'application/json' } }),
      ]);
      if (!response.ok) return;
      const result = await response.json();
      const version = result?.data?.version;
      const downloadUrl = result?.data?.download_url;
      if (result?.code !== 0 || !version || !downloadUrl || compareVersions(version, localVersion) <= 0) return;
      showUpdate(version, String(result.data.update_log || ''), downloadUrl);
    } catch { /* Network failures are intentionally silent and never block startup. */ }
  }

  window.addEventListener('DOMContentLoaded', () => { window.setTimeout(checkForUpdate, 0); }, { once: true });
})();
