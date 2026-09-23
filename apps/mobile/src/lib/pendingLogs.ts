import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, ApiError } from './api';

/**
 * Meals that were finished but not saved, held until the network comes back.
 *
 * Every other failure in this app costs a retry. This one costs the work:
 * somebody photographs a plate, waits for the estimate, corrects the portion,
 * taps Add — and if the signal has gone by then, all of it is thrown away
 * with a line of red text. Restaurants have basements.
 *
 * So a save that fails for want of a network is written here instead and
 * replayed later. Nothing else is queued: a rejected or malformed log would
 * fail the same way on every attempt, and a queue that retries those forever
 * is a worse bug than the one it fixes.
 */

const STORAGE_KEY = 'nutrisnap.pendingLogs.v1';

/** A queue longer than this means something is wrong that retrying will not fix. */
const MAX_PENDING = 50;

export interface PendingLog {
  /** Local only, for React keys and for removing the right one after a send. */
  id: string;
  body: Record<string, unknown>;
  queuedAt: string;
}

async function read(): Promise<PendingLog[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingLog[]) : [];
  } catch {
    // Unreadable storage is treated as an empty queue rather than an error:
    // there is nothing the user could do about it and nothing to recover.
    return [];
  }
}

async function write(logs: PendingLog[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  } catch {
    // The meal is lost either way if this fails; failing loudly here would
    // only replace one unrecoverable state with a more alarming one.
  }
}

export async function readPending(): Promise<PendingLog[]> {
  return read();
}

export async function pendingCount(): Promise<number> {
  return (await read()).length;
}

/**
 * Whether a failure is the kind that waiting will fix.
 *
 * `network_error` is the client's own code for "the fetch never landed", and
 * a 5xx is the server saying it was not the request's fault. A 4xx is the
 * request being wrong, which no amount of replaying will change.
 */
function isWorthRetrying(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return error.code === 'network_error' || error.status >= 500;
}

/**
 * Save a meal, or keep it until that becomes possible.
 *
 * Returns whether it went straight out, so the screen can say "added" or
 * "saved, waiting for signal" rather than guessing. Anything the server
 * actively refused is thrown, because that is a problem the user has to see
 * now — a queue would just hide it.
 */
export async function logMeal(
  body: Record<string, unknown>,
): Promise<{ queued: boolean }> {
  try {
    await api.createLog(body);
    // A success means there is a network again, so anything already waiting
    // goes now rather than on the next app launch.
    void flushPending();
    return { queued: false };
  } catch (error) {
    if (!isWorthRetrying(error)) throw error;

    const logs = await read();
    if (logs.length >= MAX_PENDING) throw error;

    await write([
      ...logs,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        /**
         * Stamped now rather than at send time, so a meal queued at dinner
         * and sent at breakfast still lands on the day it was eaten.
         */
        body: { logged_at: new Date().toISOString(), ...body },
        queuedAt: new Date().toISOString(),
      },
    ]);

    return { queued: true };
  }
}

/** Guards against two screens flushing the same queue at once. */
let flushing = false;

/**
 * Try to send everything waiting.
 *
 * Stops at the first failure that is worth retrying, because if one send
 * failed for want of a network the rest will too, and hammering a dead
 * connection twenty times helps nobody. A log the server refuses outright is
 * dropped — it was never going to be accepted, and keeping it would block
 * every meal queued behind it forever.
 */
export async function flushPending(): Promise<{ sent: number; dropped: number; left: number }> {
  if (flushing) return { sent: 0, dropped: 0, left: (await read()).length };

  flushing = true;
  try {
    const logs = await read();
    if (logs.length === 0) return { sent: 0, dropped: 0, left: 0 };

    let sent = 0;
    let dropped = 0;
    let remaining = logs;

    for (const entry of logs) {
      try {
        await api.createLog(entry.body);
        sent += 1;
      } catch (error) {
        if (isWorthRetrying(error)) break;
        dropped += 1;
      }
      remaining = remaining.filter((item) => item.id !== entry.id);
      await write(remaining);
    }

    return { sent, dropped, left: remaining.length };
  } finally {
    flushing = false;
  }
}

/** Throw the queue away. The only way out when a log will never be accepted. */
export async function clearPending(): Promise<void> {
  await write([]);
}
