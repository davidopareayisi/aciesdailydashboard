/** @param {string} value */
export function youtubeId(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    let id;
    if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(url.hostname)) {
      id = url.pathname === '/watch' ? url.searchParams.get('v') : /^\/(embed|shorts)\//.test(url.pathname) ? url.pathname.split('/')[2] : null;
    }
    return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}
/** @param {string} value */
export function hostedVideo(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && /\.(mp4|webm)$/i.test(url.pathname) ? url.href : null; } catch { return null; }
}
