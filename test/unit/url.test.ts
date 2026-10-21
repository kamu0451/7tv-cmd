import { describe, expect, it } from 'vitest';
import { channelFromUrl } from '../../src/channel/url';

describe('channelFromUrl: every URL shape of SPEC 6.1', () => {
  it.each([
    ['https://www.twitch.tv/coconutb', 'coconutb'],
    ['https://www.twitch.tv/CoconutB', 'coconutb'],
    ['https://www.twitch.tv/coconutb/', 'coconutb'],
    ['https://www.twitch.tv/coconutb?sr=a#frag', 'coconutb'],
    ['https://twitch.tv/coconutb', 'coconutb'],
    ['http://www.twitch.tv/coconutb', 'coconutb'],
    ['HTTPS://WWW.TWITCH.TV/CoconutB/About', 'coconutb'],
    ['https://www.twitch.tv/coconutb/about', 'coconutb'],
    ['https://www.twitch.tv/coconutb/schedule', 'coconutb'],
    ['https://www.twitch.tv/coconutb/videos', 'coconutb'],
    ['https://www.twitch.tv/coconutb/dashboard', 'coconutb'],
    ['https://www.twitch.tv/popout/coconutb/chat', 'coconutb'],
    ['https://www.twitch.tv/popout/coconutb/chat?popout=', 'coconutb'],
    ['https://www.twitch.tv/popout/CoconutB/extensions', 'coconutb'],
    ['https://www.twitch.tv/moderator/coconutb', 'coconutb'],
    ['https://www.twitch.tv/embed/coconutb/chat', 'coconutb'],
    ['https://dashboard.twitch.tv/u/coconutb/stream-manager', 'coconutb'],
    ['https://dashboard.twitch.tv/u/CoconutB/home', 'coconutb'],
    ['https://dashboard.twitch.tv/u/coconutb', 'coconutb'],
    ['https://m.twitch.tv/coconutb', 'coconutb'],
    ['https://m.twitch.tv/coconutb/videos', 'coconutb'],
    ['https://www.twitch.tv/a', 'a'],
    ['https://www.twitch.tv/under_score_9', 'under_score_9'],
    ['https://www.twitch.tv/' + 'a'.repeat(25), 'a'.repeat(25)],
  ])('%s -> %s', (url, expected) => {
    expect(channelFromUrl(url)).toBe(expected);
  });

  it('/videos/<id> is not a channel but /<login>/videos is', () => {
    expect(channelFromUrl('https://www.twitch.tv/videos/123456789')).toBeNull();
    expect(channelFromUrl('https://www.twitch.tv/coconutb/videos')).toBe('coconutb');
  });

  it('/popout/moderator/<login>/chat is handled like /moderator/<login> or is null (unverified shape)', () => {
    const got = channelFromUrl('https://www.twitch.tv/popout/moderator/coconutb/chat');
    expect(['coconutb', null]).toContain(got);
  });

  it('popout, embed and moderator without a login are null', () => {
    for (const url of [
      'https://www.twitch.tv/popout',
      'https://www.twitch.tv/popout/',
      'https://www.twitch.tv/embed',
      'https://www.twitch.tv/embed/',
      'https://www.twitch.tv/moderator',
      'https://www.twitch.tv/moderator/',
    ]) {
      expect(channelFromUrl(url), url).toBeNull();
    }
  });

  it('dashboard without /u/<login> is null', () => {
    expect(channelFromUrl('https://dashboard.twitch.tv/')).toBeNull();
    expect(channelFromUrl('https://dashboard.twitch.tv/u')).toBeNull();
    expect(channelFromUrl('https://dashboard.twitch.tv/u/')).toBeNull();
    expect(channelFromUrl('https://dashboard.twitch.tv/stream-manager')).toBeNull();
    expect(channelFromUrl('https://dashboard.twitch.tv/settings/channel')).toBeNull();
  });
});

describe('channelFromUrl: reserved first segments', () => {
  const RESERVED = [
    'directory', 'videos', 'settings', 'downloads', 'p', 'search', 'friends', 'inventory', 'drops',
    'subscriptions', 'wallet', 'turbo', 'jobs', 'store', 'prime', 'popout', 'embed', 'moderator', 'u',
    'team', 'following', 'messages', 'privacy', 'collections',
  ];

  it.each(RESERVED)('%s is not a channel', (seg) => {
    expect(channelFromUrl('https://www.twitch.tv/' + seg)).toBeNull();
    expect(channelFromUrl('https://www.twitch.tv/' + seg + '/')).toBeNull();
    expect(channelFromUrl('https://m.twitch.tv/' + seg)).toBeNull();
  });

  it('is case-insensitive about reserved segments', () => {
    expect(channelFromUrl('https://www.twitch.tv/Directory')).toBeNull();
    expect(channelFromUrl('https://www.twitch.tv/SETTINGS/profile')).toBeNull();
  });

  it('a reserved first segment stays null whatever follows', () => {
    expect(channelFromUrl('https://www.twitch.tv/directory/category/just-chatting')).toBeNull();
    expect(channelFromUrl('https://www.twitch.tv/settings/profile')).toBeNull();
    expect(channelFromUrl('https://www.twitch.tv/p/legal')).toBeNull();
    expect(channelFromUrl('https://www.twitch.tv/team/somebody')).toBeNull();
  });
});

describe('channelFromUrl: garbage', () => {
  it.each([
    '',
    ' ',
    'not a url',
    'https://',
    'twitch.tv/coconutb',
    '//www.twitch.tv/coconutb',
    '/coconutb',
    'javascript:alert(1)',
    'about:blank',
    'chrome-extension://abcdefghijklmnop/action/index.html',
    'https://example.com/coconutb',
    'https://nottwitch.tv/coconutb',
    'https://twitch.tv.evil.com/coconutb',
    'https://evil.com/www.twitch.tv/coconutb',
    'https://www.twitch.tv',
    'https://www.twitch.tv/',
    'https://www.twitch.tv/a-b',
    'https://www.twitch.tv/has%20space',
    'https://www.twitch.tv/' + 'a'.repeat(26),
    'https://www.twitch.tv/popout/' + 'a'.repeat(26) + '/chat',
  ])('%j -> null', (url) => {
    expect(channelFromUrl(url)).toBeNull();
  });

  it('never throws on odd input', () => {
    for (const url of ['http://[', 'https://%', '\u0000', 'https://www.twitch.tv/\u0000']) {
      expect(() => channelFromUrl(url)).not.toThrow();
    }
  });
});
