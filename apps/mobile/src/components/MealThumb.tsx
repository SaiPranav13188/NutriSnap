import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { api } from '../lib/api';
import { useColors } from '../lib/theme';

/**
 * Signed URLs, kept for the life of the app process.
 *
 * Meal photos live in a private bucket, so every thumbnail costs a round trip
 * to swap its storage path for a signed URL. A list of twenty logs would make
 * twenty of those calls on mount, and twenty more every time the day changed
 * or the list refreshed. The signature is good for an hour, so remembering it
 * turns all of that into one call per photo.
 */
const signed = new Map<string, { url: string; expires: number }>();

/** Well inside the hour the server signs for, so nothing expires mid-scroll. */
const TTL_MS = 50 * 60 * 1000;

async function resolve(stored: string): Promise<string | null> {
  // Older logs, and anything captured before the bucket existed, may already
  // hold a URL that <Image> can fetch directly.
  if (/^(https?:|file:|data:)/.test(stored)) return stored;

  const hit = signed.get(stored);
  if (hit && hit.expires > Date.now()) return hit.url;

  try {
    const { url } = await api.getPhotoUrl(stored);
    signed.set(stored, { url, expires: Date.now() + TTL_MS });
    return url;
  } catch {
    // The row reads fine without its picture.
    return null;
  }
}

/**
 * The square photo that leads each row in the meal list.
 *
 * Falls back to a plate glyph rather than a blank square: a log with no photo
 * — a barcode scan, or a favourite re-logged without one — should still line
 * its text up with the rows around it.
 */
export function MealThumb({
  path,
  name,
  size = 52,
}: {
  path: string | null;
  name: string;
  size?: number;
}) {
  const c = useColors();
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setUri(null);
    if (!path) return;

    void resolve(path).then((resolved) => {
      if (active) setUri(resolved);
    });

    // A fast scroll can unmount the row before its URL lands.
    return () => {
      active = false;
    };
  }, [path]);

  const frame = {
    width: size,
    height: size,
    borderRadius: 14,
    backgroundColor: c.glass.DEFAULT,
  } as const;

  if (!uri) {
    return (
      <View
        style={{
          ...frame,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: c.glass.border,
        }}
      >
        <Text style={{ fontSize: 20 }}>{'🍽️'}</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={frame}
      accessibilityLabel={`Photo of ${name}`}
      onError={() => setUri(null)}
    />
  );
}
