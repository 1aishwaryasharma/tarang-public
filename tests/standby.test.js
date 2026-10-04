import { beforeEach, expect, mock, test } from 'bun:test';

const pairing = { fingerprint: 'a'.repeat(64), token: 'test-token', name: 'Test TV' };
const calls = [];
const holds = [];
const nudges = [];
let respond;
let holdRespond;
let storedPairing;

mock.module('expo', () => ({
  requireNativeModule: () => ({
    probe: async () => pairing.fingerprint,
    request: async (...args) => { calls.push(args); return respond(...args); },
    holdKey: async (...args) => { holds.push(args); return holdRespond(...args); },
  }),
}));
mock.module('../src/features/tv-remote/storage/tvStorage', () => ({
  tvStorage: {
    getPairing: async () => storedPairing,
    clearPairing: async () => { storedPairing = null; },
  },
}));

const { LightningProtocol } = await import('../src/features/tv-remote/protocols/LightningProtocol');
let protocol;

beforeEach(async () => {
  storedPairing = pairing;
  calls.length = 0;
  holds.length = 0;
  nudges.length = 0;
  respond = async () => '';
  holdRespond = async () => {};
  protocol = new LightningProtocol({ nudge: (host) => nudges.push(host) });
  await protocol.connect('192.0.2.10');
});

test('TV settings waits for the current press, drops queued keys, and blocks keys during the hold', async () => {
  let finishPress;
  let finishHold;
  let holdStarted;
  const started = new Promise((resolve) => { holdStarted = resolve; });
  respond = () => new Promise((resolve) => { finishPress = resolve; });
  holdRespond = () => {
    holdStarted();
    return new Promise((resolve) => { finishHold = resolve; });
  };
  protocol.sendKeys(['up', 'right']);
  protocol.sendKey('back');
  const opening = protocol.openTVSettings();
  expect(protocol.sendKey('home')).toBe(false);
  expect(await protocol.openTVSettings()).toBe(false);
  expect(calls).toHaveLength(1);
  finishPress('');
  await started;
  expect(calls.map((call) => call[2])).toEqual(['/v1/FireTV?action=dpad_up']);
  expect(holds).toEqual([['192.0.2.10', pairing.fingerprint, '/v1/FireTV?action=home', pairing.token, 400]]);
  protocol.repeatKey('down');
  await protocol.checkConnection();
  await protocol.sleep();
  expect(protocol.link.standby).toBe('none');
  expect(calls).toHaveLength(1);
  finishHold();
  expect(await opening).toBe(true);
  respond = async () => '';
  expect(protocol.sendKey('home')).toBe(true);
  expect(nudges).toEqual([]);
});

for (const code of ['TIMEOUT', 'NETWORK', null]) {
  test(`${code} during the TV settings hold may have opened the menu, so the guide still shows`, async () => {
    holdRespond = async () => { throw Object.assign(new Error('release unconfirmed'), { code }); };
    expect(await protocol.openTVSettings()).toBe(true);
    expect(holds).toHaveLength(1);
    expect(nudges).toEqual([]);
    expect(protocol.link.standby).toBe('none');
    expect(protocol.sendKey('back')).toBe(true);
  });
}

for (const code of ['CERT', 'REFUSED', 'HTTP_500']) {
  test(`${code} rejects the TV settings hold without retrying or waking`, async () => {
    holdRespond = async () => { throw Object.assign(new Error('rejected'), { code }); };
    await expect(protocol.openTVSettings()).rejects.toThrow();
    expect(holds).toHaveLength(1);
    expect(nudges).toEqual([]);
  });
}

test('TV settings and sleep do nothing before pairing', async () => {
  storedPairing = null;
  await protocol.connect('192.0.2.10');
  expect(await protocol.openTVSettings()).toBe(false);
  expect(await protocol.sleep()).toBe(false);
  expect(holds).toEqual([]);
  expect(calls).toEqual([]);
});

test('an expired TV settings token forgets the pairing', async () => {
  holdRespond = async () => { throw Object.assign(new Error('expired'), { code: 'HTTP_403' }); };
  expect(await protocol.openTVSettings()).toBe(false);
  expect(protocol.link.paired).toBe(false);
  expect(holds).toHaveLength(1);
  expect(nudges).toEqual([]);
});

test('sleep sends one authenticated request and holds controls until reconnection', async () => {
  expect(await Promise.all([protocol.sleep(), protocol.sleep()])).toEqual([true, false]);
  expect(calls).toEqual([[
    '192.0.2.10', pairing.fingerprint, '/v1/FireTV?action=sleep', 'POST',
    '{"keyActionType":"keyDownUp"}', 'test-token', 'fast',
  ]]);
  expect(protocol.link.standby).toBe('requested');
  expect(protocol.link.paired).toBe(true);
  expect(protocol.sendKey('home')).toBe(false);
  protocol.repeatKey('up');
  await protocol.checkConnection();
  await protocol.sleep();
  expect(calls).toHaveLength(1);
  expect(nudges).toEqual([]);
  await protocol.connect('192.0.2.10');
  expect(protocol.link.standby).toBe('none');
  expect(protocol.sendKey('home')).toBe(true);
});

for (const code of ['TIMEOUT', 'NETWORK', null]) {
  test(`${code} during sleep stays unconfirmed without retrying or waking`, async () => {
    respond = async () => { throw Object.assign(new Error('lost reply'), { code }); };
    await expect(protocol.sleep()).rejects.toThrow('may have gone to sleep');
    expect(protocol.link.standby).toBe('uncertain');
    expect(protocol.sendKey('home')).toBe(false);
    await protocol.sleep();
    await protocol.checkConnection();
    expect(calls).toHaveLength(1);
    expect(nudges).toEqual([]);
  });
}

for (const code of ['CERT', 'REFUSED', 'HTTP_400']) {
  test(`${code} rejects sleep without claiming standby or waking`, async () => {
    respond = async () => { throw Object.assign(new Error('rejected'), { code }); };
    await expect(protocol.sleep()).rejects.toThrow();
    expect(protocol.link.standby).toBe('none');
    expect(protocol.link.paired).toBe(true);
    expect(calls).toHaveLength(1);
    expect(nudges).toEqual([]);
  });
}

test('an expired sleep token unpairs and reports the failure', async () => {
  const events = [];
  protocol.subscribe((event) => events.push(event));
  respond = async () => { throw Object.assign(new Error('expired'), { code: 'HTTP_403' }); };
  expect(await protocol.sleep()).toBe(false);
  expect(protocol.link.paired).toBe(false);
  expect(protocol.link.standby).toBe('none');
  expect(events.at(-1)).toEqual({ type: 'failure', error: { message: 'Pairing expired. Pair with the TV again.', source: 'user' } });
  expect(nudges).toEqual([]);
});

test('sleep waits for the current key, drops remaining PIN keys and queued taps, and suppresses recovery', async () => {
  let rejectPress;
  respond = () => new Promise((resolve, reject) => { rejectPress = reject; });
  protocol.sendKeys(['up', 'right', 'select']);
  protocol.sendKey('home');
  const sleep = protocol.sleep();
  expect(protocol.link.standby).toBe('none');
  expect(protocol.sendKey('back')).toBe(false);
  expect(calls).toHaveLength(1);
  respond = async () => '';
  rejectPress(Object.assign(new Error('refused'), { code: 'REFUSED' }));
  await sleep;
  expect(calls.map((call) => call[2])).toEqual(['/v1/FireTV?action=dpad_up', '/v1/FireTV?action=sleep']);
  expect(protocol.link.standby).toBe('requested');
  expect(nudges).toEqual([]);
});
