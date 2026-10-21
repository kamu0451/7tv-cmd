# Privacy

## What leaves your browser

When you open a Twitch page that has a chat input, the extension sends that channel's name (the
login in the page URL) to the public, unauthenticated command endpoints of Nightbot,
StreamElements, Fossabot and Moobot. It does so before you type anything, at most once per channel
per hour; the toolbar page's Refresh button can ask again at most once a minute. The requests
carry no cookies and no credentials. Those services see the channel name and your IP address, as
they would if you opened their public command page yourself.

Nothing else is sent: no Twitch login or user name, no tokens, no cookies, no Twitch API calls, no
chat messages, and not the text you type (the query after "!" is matched on the page).

## What is stored

The fetched command lists, per channel, in the browser's extension storage for one hour, for the
50 most recently visited channels, on your device only. There is no analytics, telemetry or error
reporting, and no account.

## How this is declared

The Firefox manifest declares "browsing activity" data collection
(`browser_specific_settings.gecko.data_collection_permissions`), because the channel you are
viewing is sent to third parties. Firefox shows this at install.

## Contact

Open an issue in the repository.
