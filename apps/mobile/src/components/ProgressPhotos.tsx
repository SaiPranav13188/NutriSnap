import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { api, ApiError, type ProgressPhoto } from '../lib/api';
import { useColors } from '../lib/theme';

/**
 * Progress photos.
 *
 * The scale moves slowly and noisily; a photo from six weeks ago is often the
 * only evidence that anything changed at all. Each shot stores the weight that
 * went with it, so a before-and-after pair keeps its numbers even after later
 * weigh-ins have moved the current figure.
 *
 * Photos live in the same private bucket as meal shots and arrive with signed
 * URLs already attached — the server does the signing, because a storage path
 * on its own is not something an <Image> can fetch.
 */

const THUMB = 116;

interface ProgressPhotosProps {
  /** Stamped onto a new photo so the pair keeps its numbers. */
  currentWeightKg: number | null;
  onError: (message: string) => void;
}

export function ProgressPhotos({ currentWeightKg, onError }: ProgressPhotosProps) {
  const c = useColors();
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const { photos: list } = await api.getProgressPhotos();
      setPhotos(list);
    } catch {
      // A missing gallery should not take the Progress tab down with it.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function pick() {
    if (uploading) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      onError('NutriSnap needs photo access to add a progress photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.7,
      allowsEditing: false,
    });

    const asset = result.assets?.[0];
    if (result.canceled || !asset?.base64) return;

    setUploading(true);
    try {
      await api.addProgressPhoto({
        image: asset.base64,
        media_type: asset.mimeType ?? 'image/jpeg',
        weight_kg: currentWeightKg,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : 'Could not upload that photo.');
    } finally {
      setUploading(false);
    }
  }

  function confirmDelete(photo: ProgressPhoto) {
    Alert.alert('Delete this photo?', 'It will be removed permanently.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteProgressPhoto(photo.id);
            await load();
          } catch {
            onError('Could not delete that photo.');
          }
        },
      },
    ]);
  }

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>
          Progress Photos
        </Text>

        <Pressable
          onPress={() => void pick()}
          disabled={uploading}
          accessibilityRole="button"
          accessibilityLabel="Add a progress photo"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: c.glass.border,
            opacity: uploading ? 0.5 : 1,
          }}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={c.accent.lime} />
          ) : (
            <Text style={{ color: c.text.primary, fontSize: 14, fontWeight: '600' }}>+</Text>
          )}
          <Text style={{ color: c.text.primary, fontSize: 13, fontWeight: '600' }}>
            {uploading ? 'Uploading…' : 'Add'}
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={c.accent.lime} />
      ) : photos.length === 0 ? (
        <Text style={{ color: c.text.secondary, fontSize: 14, lineHeight: 20 }}>
          Add one now and another in a few weeks. The scale moves slowly enough that photos
          are often the first place progress shows.
        </Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {photos.map((photo) => (
            <Pressable
              key={photo.id}
              onLongPress={() => confirmDelete(photo)}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Progress photo from ${photo.taken_on}`}
              accessibilityHint="Long press to delete"
              style={{ width: THUMB, gap: 5 }}
            >
              {photo.url ? (
                <Image
                  source={{ uri: photo.url }}
                  style={{ width: THUMB, height: THUMB * 1.3, borderRadius: 16 }}
                />
              ) : (
                <View
                  style={{
                    width: THUMB,
                    height: THUMB * 1.3,
                    borderRadius: 16,
                    backgroundColor: c.glass.DEFAULT,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: c.text.tertiary, fontSize: 11 }}>Unavailable</Text>
                </View>
              )}

              <Text style={{ color: c.text.tertiary, fontSize: 11 }}>
                {new Date(photo.taken_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
                {photo.weight_kg != null ? ` · ${photo.weight_kg} kg` : ''}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
