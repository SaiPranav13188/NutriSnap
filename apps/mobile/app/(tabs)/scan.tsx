import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useCallback } from 'react';
import {
  scaleIngredients,
  scaleTotals,
  totalsFromIngredients,
  type FoodAnalysis,
  type Ingredient,
} from '@nutrisnap/core';
import { colors } from '@nutrisnap/ui';
import { api, ApiError } from '../../src/lib/api';
import { AnimatedNumber, Button, Card, ErrorNote, Screen } from '../../src/components/ui';

type Mode = 'photo' | 'text' | 'barcode' | 'label';

const MODES: Array<{ value: Mode; label: string }> = [
  { value: 'photo', label: 'Scan food' },
  { value: 'barcode', label: 'Barcode' },
  { value: 'label', label: 'Food label' },
  { value: 'text', label: 'Describe' },
];

export default function Scan() {
  const [mode, setMode] = useState<Mode>('photo');
  const [analysis, setAnalysis] = useState<FoodAnalysis | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [lastImage, setLastImage] = useState<{ base64: string; mediaType: string } | null>(null);

  const [multiplier, setMultiplier] = useState(1);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [correction, setCorrection] = useState('');
  const [showFix, setShowFix] = useState(false);

  const [description, setDescription] = useState('');
  const [barcode, setBarcode] = useState('');

  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Leaving the tab should not strand a half-finished result.
  useFocusEffect(
    useCallback(() => {
      return () => setError(null);
    }, []),
  );

  function reset() {
    setAnalysis(null);
    setPhotoUrl(null);
    setPreview(null);
    setLastImage(null);
    setIngredients([]);
    setMultiplier(1);
    setCorrection('');
    setShowFix(false);
    setError(null);
  }

  function applyAnalysis(result: { analysis: FoodAnalysis; photo_url: string | null }, previewUri: string | null) {
    setAnalysis(result.analysis);
    setIngredients(result.analysis.ingredients);
    setPhotoUrl(result.photo_url);
    setPreview(previewUri);
    setMultiplier(1);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function pickImage(source: 'camera' | 'library') {
    setError(null);

    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setError(
        source === 'camera'
          ? 'NutriSnap needs camera access to photograph your meal.'
          : 'NutriSnap needs photo access to read your library.',
      );
      return;
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
      allowsEditing: false,
    };

    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

    if (result.canceled || !result.assets[0]?.base64) return;

    const asset = result.assets[0];
    const image = { base64: asset.base64!, mediaType: asset.mimeType ?? 'image/jpeg' };
    setLastImage(image);
    setPreview(asset.uri);
    setBusy(true);

    try {
      const response =
        mode === 'label'
          ? await api.analyzeLabel({ image: image.base64, media_type: image.mediaType })
          : await api.analyzePhoto({ image: image.base64, media_type: image.mediaType });
      applyAnalysis(response, asset.uri);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not analyse that photo.');
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function runText() {
    setBusy(true);
    setError(null);
    try {
      applyAnalysis(await api.analyzeText(description.trim()), null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not read that description.');
    } finally {
      setBusy(false);
    }
  }

  async function runBarcode() {
    setBusy(true);
    setError(null);
    try {
      applyAnalysis(await api.lookupBarcode(barcode), null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not look that product up.');
    } finally {
      setBusy(false);
    }
  }

  async function runFix() {
    if (!analysis) return;
    setBusy(true);
    setError(null);
    try {
      if (lastImage) {
        const response = await api.analyzePhoto({
          image: lastImage.base64,
          media_type: lastImage.mediaType,
          correction: correction.trim(),
          previous: analysis,
          store_photo: false,
        });
        applyAnalysis({ ...response, photo_url: photoUrl }, preview);
      } else {
        const response = await api.analyzeText(`${analysis.name}. Correction: ${correction.trim()}`);
        applyAnalysis(response, null);
      }
      setShowFix(false);
      setCorrection('');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not re-analyse that.');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!analysis) return;
    setSaving(true);
    setError(null);

    const edited = totalsFromIngredients(ingredients, analysis.totals, analysis.ingredients);
    const totals = scaleTotals(edited, multiplier);

    try {
      await api.createLog({
        name: analysis.name,
        photo_url: photoUrl,
        serving_multiplier: multiplier,
        estimated_grams: analysis.estimated_grams * multiplier,
        calories: Math.round(totals.calories),
        protein_g: Math.round(totals.protein_g),
        carbs_g: Math.round(totals.carbs_g),
        fat_g: Math.round(totals.fat_g),
        sugar_g: Math.round(totals.sugar_g),
        fiber_g: Math.round(totals.fiber_g),
        sodium_mg: Math.round(totals.sodium_mg),
        ai_confidence: analysis.confidence,
        source: photoUrl ? 'photo' : 'text',
        ingredients: scaleIngredients(ingredients, multiplier),
      });

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      reset();
      router.replace('/(tabs)');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save that meal.');
      setSaving(false);
    }
  }

  const inputStyle = {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    color: colors.text.primary,
    padding: 14,
    fontSize: 16,
  } as const;

  // -------------------------------------------------------------- results --
  if (analysis) {
    const edited = totalsFromIngredients(ingredients, analysis.totals, analysis.ingredients);
    const totals = scaleTotals(edited, multiplier);
    const scaled = scaleIngredients(ingredients, multiplier);
    const confidence = Math.round(analysis.confidence * 100);

    return (
      <Screen>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 40 }}>
            {preview && (
              <Animated.View entering={FadeIn.duration(400)}>
                <Image
                  source={{ uri: preview }}
                  style={{ width: '100%', aspectRatio: 1, borderRadius: 24 }}
                  accessibilityLabel="The meal you photographed"
                />
              </Animated.View>
            )}

            <Card style={{ padding: 18, gap: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text.primary, fontSize: 20, fontWeight: '700', lineHeight: 26 }}>
                    {analysis.name}
                  </Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: 13, marginTop: 3 }}>
                    About {Math.round(analysis.estimated_grams * multiplier)} g
                  </Text>
                </View>

                <View
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 999,
                    backgroundColor: confidence < 60 ? 'rgba(255,194,75,0.12)' : 'rgba(67,230,160,0.12)',
                  }}
                >
                  <Text
                    style={{
                      color: confidence < 60 ? colors.state.warning : colors.state.success,
                      fontSize: 11,
                      fontWeight: '600',
                    }}
                  >
                    {confidence}% sure
                  </Text>
                </View>
              </View>

              {analysis.notes ? (
                <Text style={{ color: colors.text.secondary, fontSize: 13, lineHeight: 19 }}>
                  {analysis.notes}
                </Text>
              ) : null}

              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                {(
                  [
                    { label: 'Calories', value: totals.calories, color: colors.accent.lime, suffix: '' },
                    { label: 'Protein', value: totals.protein_g, color: colors.macro.protein, suffix: 'g' },
                    { label: 'Carbs', value: totals.carbs_g, color: colors.macro.carbs, suffix: 'g' },
                    { label: 'Fat', value: totals.fat_g, color: colors.macro.fat, suffix: 'g' },
                  ] as const
                ).map((metric) => (
                  <View key={metric.label} style={{ alignItems: 'center' }}>
                    <AnimatedNumber
                      value={Math.round(metric.value)}
                      suffix={metric.suffix}
                      duration={600}
                      style={{ color: metric.color, fontSize: 19, fontWeight: '700' }}
                    />
                    <Text style={{ color: colors.text.tertiary, fontSize: 10, marginTop: 3, textTransform: 'uppercase' }}>
                      {metric.label}
                    </Text>
                  </View>
                ))}
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
                <Text style={{ color: colors.text.tertiary, fontSize: 11 }}>
                  Sugar {Math.round(totals.sugar_g)}g
                </Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 11 }}>
                  Fibre {Math.round(totals.fiber_g)}g
                </Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 11 }}>
                  Sodium {Math.round(totals.sodium_mg)}mg
                </Text>
              </View>
            </Card>

            <Card style={{ padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '500' }}>Servings</Text>
                <Text style={{ color: colors.text.secondary, fontSize: 13, marginTop: 2 }}>
                  How much did you eat?
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Decrease servings"
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setMultiplier((m) => Math.max(0.25, Math.round((m - 0.25) * 100) / 100));
                  }}
                  style={stepperStyle}
                >
                  <Text style={{ color: colors.text.primary, fontSize: 22 }}>−</Text>
                </Pressable>

                <Text style={{ color: colors.text.primary, fontSize: 19, fontWeight: '700', minWidth: 52, textAlign: 'center' }}>
                  {multiplier}×
                </Text>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Increase servings"
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setMultiplier((m) => Math.min(10, Math.round((m + 0.25) * 100) / 100));
                  }}
                  style={stepperStyle}
                >
                  <Text style={{ color: colors.text.primary, fontSize: 22 }}>+</Text>
                </Pressable>
              </View>
            </Card>

            {scaled.length > 0 && (
              <Card style={{ padding: 18 }}>
                <Text
                  style={{
                    color: colors.text.secondary,
                    fontSize: 12,
                    fontWeight: '600',
                    textTransform: 'uppercase',
                    letterSpacing: 1.1,
                  }}
                >
                  Ingredients
                </Text>

                {scaled.map((ingredient, i) => (
                  <Animated.View key={`${ingredient.name}-${i}`} entering={FadeInDown.delay(i * 60)}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 10,
                        paddingVertical: 11,
                        borderBottomWidth: i === scaled.length - 1 ? 0 : 1,
                        borderBottomColor: 'rgba(255,255,255,0.06)',
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text.primary, fontSize: 15 }}>{ingredient.name}</Text>
                        <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>
                          {Math.round(ingredient.grams)} g
                        </Text>
                      </View>

                      <Text style={{ color: colors.text.secondary, fontSize: 13 }}>
                        {Math.round(ingredient.calories)} kcal
                      </Text>

                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${ingredient.name}`}
                        onPress={() => setIngredients((list) => list.filter((_, index) => index !== i))}
                        style={{ padding: 6 }}
                      >
                        <Text style={{ color: colors.state.danger, fontSize: 16 }}>×</Text>
                      </Pressable>
                    </View>
                  </Animated.View>
                ))}
              </Card>
            )}

            {showFix && (
              <Card style={{ padding: 18, gap: 12 }}>
                <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '600' }}>
                  What did we get wrong?
                </Text>
                <TextInput
                  value={correction}
                  onChangeText={setCorrection}
                  multiline
                  numberOfLines={3}
                  maxLength={500}
                  placeholder="e.g. That's two servings, and it's tofu, not chicken."
                  placeholderTextColor={colors.text.tertiary}
                  style={[inputStyle, { minHeight: 88, textAlignVertical: 'top' }]}
                />
                <Button onPress={runFix} loading={busy} disabled={correction.trim().length < 3}>
                  Re-analyse with my note
                </Button>
              </Card>
            )}

            {error && <ErrorNote message={error} />}

            <View style={{ gap: 10, marginTop: 4 }}>
              <Button onPress={save} loading={saving}>
                Add to my day
              </Button>
              {!showFix && (
                <Button variant="glass" onPress={() => setShowFix(true)}>
                  Fix results
                </Button>
              )}
              <Button variant="ghost" onPress={reset}>
                Discard
              </Button>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Screen>
    );
  }

  // -------------------------------------------------------------- capture --
  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
          <View>
            <Text style={{ color: colors.text.primary, fontSize: 26, fontWeight: '700' }}>Log a meal</Text>
            <Text style={{ color: colors.text.secondary, fontSize: 15, marginTop: 4 }}>
              Photograph it, scan it, or just say what it was.
            </Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {MODES.map((item) => {
              const active = mode === item.value;
              return (
                <Pressable
                  key={item.value}
                  onPress={() => {
                    void Haptics.selectionAsync();
                    setMode(item.value);
                    setError(null);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? 'rgba(198,255,61,0.6)' : 'rgba(255,255,255,0.12)',
                    backgroundColor: active ? 'rgba(198,255,61,0.10)' : 'transparent',
                  }}
                >
                  <Text style={{ color: active ? colors.text.primary : colors.text.secondary, fontSize: 14, fontWeight: '500' }}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {(mode === 'photo' || mode === 'label') && (
            <Card style={{ padding: 20, gap: 16 }}>
              <View
                style={{
                  aspectRatio: 1,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: 'rgba(255,255,255,0.16)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 24,
                }}
              >
                {preview ? (
                  <Image source={{ uri: preview }} style={{ width: '100%', height: '100%', borderRadius: 18 }} />
                ) : (
                  <>
                    <Text style={{ fontSize: 40 }}>{mode === 'label' ? '🏷️' : '📸'}</Text>
                    <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '600', marginTop: 16, textAlign: 'center' }}>
                      {mode === 'label' ? 'Photograph the nutrition panel' : 'Take a photo of your meal'}
                    </Text>
                    <Text style={{ color: colors.text.secondary, fontSize: 13, marginTop: 8, textAlign: 'center', lineHeight: 19 }}>
                      {mode === 'label'
                        ? 'Get the whole panel in frame and keep it flat.'
                        : 'Shoot from above, and include a fork or your hand so we can judge the portion.'}
                    </Text>
                  </>
                )}
              </View>

              <Button onPress={() => pickImage('camera')} loading={busy}>
                Take photo
              </Button>
              <Button variant="glass" onPress={() => pickImage('library')} disabled={busy}>
                Choose from library
              </Button>
            </Card>
          )}

          {mode === 'text' && (
            <Card style={{ padding: 20, gap: 14 }}>
              <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '600' }}>
                What did you eat?
              </Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
                maxLength={500}
                placeholder="Two scrambled eggs, sourdough with butter, and a flat white"
                placeholderTextColor={colors.text.tertiary}
                style={[inputStyle, { minHeight: 110, textAlignVertical: 'top' }]}
              />
              <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>
                Mention quantities where you know them — it makes the estimate much better.
              </Text>
              <Button onPress={runText} loading={busy} disabled={description.trim().length < 2}>
                Work out the macros
              </Button>
            </Card>
          )}

          {mode === 'barcode' && (
            <Card style={{ padding: 20, gap: 14 }}>
              <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '600' }}>
                Barcode number
              </Text>
              <TextInput
                value={barcode}
                onChangeText={(text) => setBarcode(text.replace(/\D/g, ''))}
                keyboardType="number-pad"
                maxLength={14}
                placeholder="5000112637922"
                placeholderTextColor={colors.text.tertiary}
                style={[inputStyle, { fontSize: 20, textAlign: 'center', letterSpacing: 2 }]}
              />
              <Text style={{ color: colors.text.tertiary, fontSize: 12, lineHeight: 18 }}>
                Type the digits printed under the barcode. Data comes from Open Food Facts, so
                coverage depends on what the community has catalogued.
              </Text>
              <Button onPress={runBarcode} loading={busy} disabled={barcode.length < 6}>
                Look it up
              </Button>
            </Card>
          )}

          {error && <ErrorNote message={error} />}
        </ScrollView>
      </SafeAreaView>
    </Screen>
  );
}

const stepperStyle = {
  width: 40,
  height: 40,
  borderRadius: 20,
  borderWidth: 1,
  borderColor: 'rgba(255,255,255,0.14)',
  alignItems: 'center',
  justifyContent: 'center',
} as const;
