import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { haversineMeters, mpsToMph, type LatLng } from '@nutrisnap/core';
import type { RideEngine } from './rideEngine';

export type GpsState = 'off' | 'denied' | 'searching' | 'live';

/** Below this the fix is noise around a stationary bike, not movement. */
const MIN_MOVING_MPH = 1.2;

/**
 * How heavily each new reading is weighted.
 *
 * Raw GPS speed jumps around by a mile an hour or more between fixes even on
 * a rider holding a steady pace. Smoothing costs a second or two of lag,
 * which nobody riding a bike will notice, and it is what stops the band
 * picker twitching.
 */
const SMOOTHING = 0.35;

/**
 * Feed the ride's speed from the phone's GPS.
 *
 * Speed goes straight into the engine rather than into React state: the
 * display already subscribes to the engine for everything else, and routing
 * it through a re-render here would undo the work of keeping the tick out of
 * the component tree.
 */
export function useRideSpeed(engine: RideEngine, enabled: boolean): GpsState {
  const [state, setState] = useState<GpsState>('off');

  /** Smoothed mph, and the last fix, for the devices that report no speed. */
  const smoothed = useRef<number | null>(null);
  const previous = useRef<{ at: number; coords: LatLng } | null>(null);

  useEffect(() => {
    if (!enabled) {
      setState('off');
      smoothed.current = null;
      previous.current = null;
      engine.setSpeed(null);
      return;
    }

    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    void (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;

      if (!permission.granted) {
        setState('denied');
        return;
      }

      setState('searching');

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 1000,
          distanceInterval: 0,
        },
        (fix) => {
          if (cancelled) return;

          const at = fix.timestamp;
          const coords = { latitude: fix.coords.latitude, longitude: fix.coords.longitude };

          // `speed` is the fix's own reading where there is one. Plenty of
          // Android devices leave it null or -1, so the fallback works it
          // out from how far the bike moved between two fixes.
          let mph: number | null = null;
          if (typeof fix.coords.speed === 'number' && fix.coords.speed >= 0) {
            mph = mpsToMph(fix.coords.speed);
          } else if (previous.current) {
            const seconds = (at - previous.current.at) / 1000;
            if (seconds > 0.5) {
              mph = mpsToMph(haversineMeters(previous.current.coords, coords) / seconds);
            }
          }

          previous.current = { at, coords };
          if (mph === null) return;

          // A parked bike still produces a metre or two of drift per fix.
          const moving = mph < MIN_MOVING_MPH ? 0 : mph;

          smoothed.current =
            smoothed.current === null
              ? moving
              : smoothed.current + SMOOTHING * (moving - smoothed.current);

          setState('live');
          engine.setSpeed(smoothed.current);
        },
      );

      if (cancelled) subscription.remove();
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
      engine.setSpeed(null);
    };
  }, [enabled, engine]);

  return state;
}
