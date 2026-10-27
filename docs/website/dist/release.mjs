export const REPO = 'GuqiGG/Bili-Space';
export const RELEASE_PAGE = `https://github.com/${REPO}/releases/latest`;
export const RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;

// Never turn arbitrary release text into HTML or arbitrary asset URLs into links.
export function selectInstaller(release) {
  if (!release || release.draft !== false || release.prerelease !== false || typeof release.tag_name !== 'string' || !Array.isArray(release.assets)) return null;
  const candidates = release.assets.filter(asset => {
    if (!asset || typeof asset.name !== 'string' || !/(?:setup|installer|install)[^/]*\.exe$/i.test(asset.name) || /arm64|aarch64|ia32|(?:^|[-_])x86(?:[-_.]|$)/i.test(asset.name) || asset.state !== 'uploaded') return false;
    try {
      const url = new URL(asset.browser_download_url);
      return url.protocol === 'https:' && url.hostname === 'github.com' && !url.username && !url.password && url.pathname.startsWith(`/${REPO}/releases/download/`) && decodeURIComponent(url.pathname.split('/').pop()) === asset.name;
    } catch { return false; }
  }).sort((a,b) => Number(/x64|win64|amd64/i.test(b.name)) - Number(/x64|win64|amd64/i.test(a.name)) || a.name.localeCompare(b.name));
  if (!candidates.length) return null;
  const asset = candidates[0];
  return {version:release.tag_name.slice(0,64), url:asset.browser_download_url, name:asset.name, size:Number.isFinite(asset.size) && asset.size > 0 ? asset.size : null, published:typeof release.published_at === 'string' ? release.published_at : null};
}

export async function fetchLatest(fetcher = fetch, signal) {
  const response = await fetcher(RELEASE_API, {headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}, signal, credentials:'omit'});
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
  const release = await response.json();
  return {release, installer:selectInstaller(release)};
}

export function cacheRecord(release, now=Date.now()) {
  const installer = selectInstaller(release);
  if (!installer) return null;
  return {time:now, release:{tag_name:release.tag_name,draft:false,prerelease:false,published_at:release.published_at,assets:release.assets.filter(a => a.browser_download_url === installer.url)}};
}

export function readCache(text, now=Date.now()) {
  try {
    const record = JSON.parse(text);
    if (!record || !Number.isFinite(record.time) || record.time > now || now-record.time > 24*60*60*1000) return null;
    return selectInstaller(record.release);
  } catch { return null; }
}
