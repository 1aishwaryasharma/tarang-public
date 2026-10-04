export type TVKey =
  | 'up' | 'down' | 'left' | 'right' | 'select' | 'back' | 'home' | 'menu'
  | 'playPause' | 'volumeUp' | 'volumeDown' | 'mute';

/** online: the TV answered. stale: a press or check failed without a clear refusal, and nothing is retried automatically. offline: refused, timed out, certificate mismatch, or never reached. */
export type LinkHealth = 'online' | 'stale' | 'offline';

/** requested: the TV accepted a sleep request. uncertain: the reply was lost, so the TV may be asleep. Either lasts until the app reconnects. */
export type Standby = 'none' | 'requested' | 'uncertain';

/** name: the paired TV's name as it was when paired, or null when unpaired or never learned. */
export type LinkState = { host: string; paired: boolean; health: LinkHealth; name: string | null; standby: Standby };

/** One Fire TV a network search saw, with the name it advertises if it gave one. */
export type FoundTV = { host: string; name: string | null };

/** link: the TV or the network failed, and the error clears once the link is online again. press: the TV answered a key with an error, and the error clears when the user's next tap is accepted. user: a step the user started failed, and the error clears when the next connect, wake, or pairing step starts. */
export type ErrorSource = 'link' | 'press' | 'user';

export type RemoteError = { message: string; source: ErrorSource };

export type LinkEvent =
  | { type: 'link'; link: LinkState }
  | { type: 'failure'; error: RemoteError };

/** connecting, searching, and waking are the phases of one connect step, in that order. */
export type Activity = 'idle' | 'connecting' | 'searching' | 'waking' | 'sleeping' | 'openingTVSettings' | 'requestingPin' | 'verifyingPin' | 'forgetting';
