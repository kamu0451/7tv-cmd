// Shared types, copied verbatim from docs/SPEC.md section 3. Frozen for the round: adding
// exports is allowed, changing or removing them is not.

export type ProviderId = string; // 'nightbot' | 'streamelements' | 'fossabot' | 'moobot' | ... per docs/providers/

export type UserLevel = 'everyone' | 'subscriber' | 'regular' | 'vip' | 'moderator' | 'owner' | 'unknown';

export interface Command {
  name: string;          // without the leading "!", lowercased, trimmed, no whitespace; e.g. "discord"
  aliases: string[];     // same normalisation; [] when none; never contains name
  response: string;      // the bot's reply template or the provider's description; single line, trimmed, max 300 chars; '' when unknown
  provider: ProviderId;  // the provider that won the merge
  alsoOn: ProviderId[];  // other providers that publish the same name; [] when none
  cooldownSec?: number;  // omitted when the provider does not publish it
  userLevel?: UserLevel; // omitted when unknown
}

export type ProviderStatus = 'ok' | 'empty' | 'error' | 'unsupported';

export interface ProviderResult {
  provider: ProviderId;
  status: ProviderStatus; // ok: commands.length > 0; empty: provider knows no commands for this login (cached as empty); error: network/HTTP/parse failure; unsupported: adapter disabled by design
  commands: Command[];    // [] unless status is ok
  fetchedAt: number;      // epoch ms
  requests: number;       // HTTP requests this result cost
  error?: string;         // one line, no stack, for error
}

export interface ChannelCommands {
  login: string;              // Twitch login, lowercased
  commands: Command[];        // merged across providers (section 5.3)
  providers: ProviderResult[];
  fetchedAt: number;          // oldest fetchedAt among providers
  fromCache: boolean;
}

export type MatchKind = 'exact' | 'prefix' | 'substring';

export interface Suggestion {
  command: Command;
  matched: string;            // the name or alias that matched (equals command.name when the name matched)
  viaAlias: boolean;
  kind: MatchKind;
  range: [number, number];    // [start, end) inside `matched` to highlight; [0, 0] for an empty query
}
