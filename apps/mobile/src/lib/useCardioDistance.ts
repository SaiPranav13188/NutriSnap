import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { haversineMeters, type LatLng } from '@nutrisnap/core';
import type { CardioEngine } from './cardioEngine';

export type DistanceSource = 'off' | 'denied' | 'searching' | 'live';

/**
 * A fix this far from the last one is GPS drift, not a stride.
 *
 * Standing still under a clear sky still produces a couple of metres of
 * wander per second, and adding all of it up would have a stationary runner
 * covering half a kilometre an hour.
 */
const MIN_STEP_M = 3;

/** Beyond this the fix jumped, which is a lost signal reacquiring, not a sprint. */
const MAX_STEP_M = 80;

/**
 * Accumulate distance from the phone's GPS.
 *
 * Only for the activities that move through the world. A treadmill goes
 * nowhere, so its distance has to be typed — which is why the profile carries
 * an `outdoors` flag rather than this hook guessing from the name.
 */
export function useCardioDistance(engine: CardioEngine, enabled: boolean): DistanceSource {
  const [state, setState] = useState<DistanceSource>('off');
  const previous = useRef<LatLng | null>(null);
  const total = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setState('off');
      previous.current = null;
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
        { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 },
        (fix) => {
          if (cancelled) return;

          const coords = { latitude: fix.coords.latitude, longitude: fix.coords.longitude };

          if (previous.current) {
            const step = haversineMeters(previous.current, coords);
            if (step >= MIN_STEP_M && step <= MAX_STEP_M) {
              total.current += step;
              engine.setDistance(total.current);
            }
          }

          previous.current = coords;
          setState('live');
        },
      );

      if (cancelled) subscription.remove();
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [enabled, engine]);

  return state;
}
