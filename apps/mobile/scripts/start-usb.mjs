#!/usr/bin/env node
/**
 * Start Metro for a phone attached by USB.
 *
 * Two things have to be true before Expo Go can load over a cable, and both
 * fail quietly:
 *
 *   1. `adb reverse` has to be in place, pointing the device's localhost:8081
 *      at this machine. It is cleared every time the cable is unplugged or the
 *      adb daemon restarts, so it runs here on every start rather than once at
 *      setup time.
 *
 *   2. Metro has to be listening on IPv4. `expo start --localhost` asks Node to
 *      bind "localhost", and on Windows that resolves to ::1 first, so Metro
 *      ends up on IPv6 loopback alone. adb reverse connects to 127.0.0.1, finds
 *      nothing, and Expo Go shows "Something went wrong" with no clue that the
 *      two are a few bytes of address apart. Resolving IPv4 first puts Metro
 *      where adb is looking.
 *
 * Any extra arguments are passed through, so `--clear` and friends still work.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PORT = 8081;
const exe = process.platform === 'win32' ? 'adb.exe' : 'adb';

/**
 * Every place an Android SDK normally lands, plus a bare PATH lookup last.
 * PATH alone is not enough: a freshly installed SDK only reaches terminals
 * opened afterwards, which makes this work in one window and fail in another.
 */
function candidates() {
  const roots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
    join(homedir(), 'AppData', 'Local', 'Android', 'Sdk'),
    join(homedir(), 'Android', 'Sdk'),
    join(homedir(), 'Library', 'Android', 'sdk'),
  ].filter(Boolean);

  return [
    ...roots.map((root) => join(root, 'platform-tools', exe)).filter(existsSync),
    'adb',
  ];
}

const adb = candidates().find((candidate) => {
  const probe = spawnSync(candidate, ['version'], { encoding: 'utf8' });
  return !probe.error && probe.status === 0;
});

if (!adb) {
  console.error(
    [
      'adb not found.',
      '',
      'Install Android platform-tools and set ANDROID_HOME to the SDK folder:',
      '  https://developer.android.com/tools/releases/platform-tools',
      '',
      'Or start over Wi-Fi instead, which needs no adb:',
      '  pnpm dev:mobile',
    ].join('\n'),
  );
  process.exit(1);
}

const reverse = spawnSync(adb, ['reverse', `tcp:${PORT}`, `tcp:${PORT}`], { encoding: 'utf8' });

if (reverse.status !== 0) {
  const detail = (reverse.stderr || reverse.stdout || '').trim();
  console.error(
    [
      `Could not forward port ${PORT} to the device.`,
      detail && `  ${detail}`,
      '',
      'Usually one of:',
      '  - the phone is unplugged, or the cable is charge-only',
      '  - USB debugging is off (Developer options)',
      '  - the "Allow USB debugging?" prompt is still waiting on an unlocked screen',
      '',
      'Check what adb can see with:',
      `  "${adb}" devices`,
    ]
      .filter(Boolean)
      .join('\n'),
  );
  process.exit(1);
}

console.log(`adb reverse tcp:${PORT} ready. Starting Metro on IPv4 localhost...`);

const nodeOptions = [process.env.NODE_OPTIONS, '--dns-result-order=ipv4first']
  .filter(Boolean)
  .join(' ');

// A shell is needed because `expo` resolves to a .cmd shim on Windows, and a
// shell with a separate args array is deprecated (DEP0190) — so the command
// goes over as one already-quoted string.
const command = ['expo', 'start', '--localhost', ...process.argv.slice(2)]
  .map((part) => (/[\s"]/.test(part) ? JSON.stringify(part) : part))
  .join(' ');

const expo = spawn(command, {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, NODE_OPTIONS: nodeOptions },
});

expo.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
