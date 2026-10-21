// channelFromUrl (docs/SPEC.md section 6.1): the Twitch login in a twitch.tv URL, lowercased, or null.
// Twitch is a single-page app: content/index.ts re-runs this when location.href changes (checked in
// the watchChatInput mutation callback, on popstate and on visibilitychange).

const LOGIN = /^[a-z0-9_]{1,25}$/;

// First path segments that are Twitch pages, not channels (SPEC 6.1).
const RESERVED = new Set([
  'directory', 'videos', 'settings', 'downloads', 'p', 'search', 'friends', 'inventory', 'drops',
  'subscriptions', 'wallet', 'turbo', 'jobs', 'store', 'prime', 'popout', 'embed', 'moderator', 'u',
  'team', 'following', 'messages', 'privacy', 'collections',
]);

function login(seg: string | undefined): string | null {
  if (!seg || !LOGIN.test(seg) || RESERVED.has(seg)) return null;
  return seg;
}

export function channelFromUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (host !== 'twitch.tv' && !host.endsWith('.twitch.tv')) return null;
  const segs = u.pathname.toLowerCase().split('/').filter((s) => s.length > 0);

  if (host === 'dashboard.twitch.tv') {
    // https://dashboard.twitch.tv/u/<login>/...
    return segs[0] === 'u' ? login(segs[1]) : null;
  }

  const first = segs[0];
  if (!first) return null;
  if (first === 'popout') {
    // /popout/moderator/<login>/chat is handled like /moderator/<login> (unverified shape).
    if (segs[1] === 'moderator') return login(segs[2]);
    return login(segs[1]);
  }
  if (first === 'moderator' || first === 'embed') return login(segs[1]);
  // /<login>, /<login>/videos, /<login>/about, /<login>/dashboard, m.twitch.tv/<login>;
  // /videos/<id> and the other reserved first segments are null.
  return login(first);
}
