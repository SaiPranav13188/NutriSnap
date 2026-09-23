import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useColors } from '../lib/theme';

export interface CapturedPhoto {
  uri: string;
  base64: string;
  mediaType: string;
}

/**
 * The symbologies worth watching for.
 *
 * A closed list rather than everything the scanner can read: leaving QR on
 * means a poster in the background of a shelf can hijack a scan, and none of
 * the formats here appear on anything that is not packaged food.
 */
const FOOD_BARCODES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] as const;

/**
 * The in-app viewfinder.
 *
 * "Take photo" used to hand off to the system camera through the image
 * picker, which meant leaving the app, and — the reason this exists — meant
 * that a camera permission the user had already refused once left nothing but
 * a red line of text. Android stops showing the dialog after the second
 * refusal, so the request silently returned "denied" and the screen had no
 * way forward.
 *
 * Now the permission is asked for here, in front of the viewfinder it is for,
 * and when the system will no longer show the dialog the sheet says so and
 * opens the app's settings page directly. Coming back re-checks, so the
 * camera is live the moment the switch is flipped.
 */
export function CameraSheet({
  visible,
  onClose,
  onCapture,
  onBarcode,
  hint,
}: {
  visible: boolean;
  onClose: () => void;
  onCapture: (photo: CapturedPhoto) => void;
  /**
   * Given instead of a shutter: the sheet watches for a barcode and reports
   * the first one it reads, rather than waiting to be told to take a picture.
   */
  onBarcode?: (code: string) => void;
  /** One line of framing advice, shown over the preview. */
  hint: string;
}) {
  const c = useColors();
  const camera = useRef<CameraView>(null);
  const scanning = onBarcode !== undefined;

  /**
   * A barcode in frame fires this callback on every frame it stays there.
   *
   * Without the latch, one yoghurt pot held steady for a second becomes
   * thirty lookups and a rate-limited API. It resets when the sheet reopens,
   * so scanning a second product needs no extra gesture.
   */
  const handled = useRef(false);
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [capturing, setCapturing] = useState(false);
  /** True while a permission read is in flight, so the refusal panel does not flash. */
  const [checking, setChecking] = useState(false);

  /**
   * Whether this opening of the sheet has already put the dialog up.
   *
   * Without it the effect below re-fires on the state change a refusal
   * causes, and the dialog the user just dismissed comes straight back.
   */
  const asked = useRef(false);

  /**
   * Read the permission fresh every time the sheet opens, then ask for it.
   *
   * The hook's own value is a snapshot taken when this component first
   * mounted, which is when the Scan tab first rendered — possibly hours and
   * one trip through the settings app ago. Deciding from that snapshot is
   * what left the sheet insisting access was off after it had been granted.
   *
   * The request goes out even when the snapshot said the system would not
   * prompt again: on Android that call returns immediately and costs
   * nothing, and it is one less piece of stale state to be wrong about.
   */
  useEffect(() => {
    if (!visible) {
      asked.current = false;
      handled.current = false;
      return;
    }

    let cancelled = false;
    setChecking(true);

    void (async () => {
      try {
        const current = await getPermission();
        if (cancelled || current.granted || asked.current) return;
        asked.current = true;
        await requestPermission();
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, getPermission, requestPermission]);

  /**
   * Re-read when the app comes back to the foreground.
   *
   * The "Open settings" route leaves the app to flip a switch elsewhere, and
   * nothing tells the hook about it. Without this the sheet would still be
   * showing the refusal panel over a camera it is now allowed to use.
   */
  useEffect(() => {
    if (!visible) return;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void getPermission();
    });

    return () => subscription.remove();
  }, [visible, getPermission]);

  async function recheck() {
    setChecking(true);
    try {
      await getPermission();
    } finally {
      setChecking(false);
    }
  }

  async function capture() {
    if (capturing || !camera.current) return;
    setCapturing(true);
    try {
      const photo = await camera.current.takePictureAsync({ base64: true, quality: 0.7 });
      if (!photo?.base64) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onCapture({
        uri: photo.uri,
        base64: photo.base64,
        mediaType: photo.format === 'png' ? 'image/png' : 'image/jpeg',
      });
    } catch {
      // Nothing was captured, so the sheet stays open for another go rather
      // than closing on an error the user cannot act on.
    } finally {
      setCapturing(false);
    }
  }

  const granted = permission?.granted ?? false;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {granted ? (
          <CameraView
            ref={camera}
            style={{ flex: 1 }}
            facing={facing}
            barcodeScannerSettings={scanning ? { barcodeTypes: [...FOOD_BARCODES] } : undefined}
            onBarcodeScanned={
              scanning
                ? ({ data }) => {
                    const code = data.trim();
                    // Open Food Facts keys on the digits alone, and a reader
                    // that returns anything else has read something that is
                    // not a product code.
                    if (handled.current || !/^\d{6,14}$/.test(code)) return;
                    handled.current = true;
                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    onBarcode?.(code);
                  }
                : undefined
            }
          />
        ) : (
          <PermissionPanel
            // Null means the permission state has not been read yet, which is
            // a moment, not a refusal.
            checking={checking || !permission}
            canAskAgain={permission?.canAskAgain ?? true}
            onRequest={() => void requestPermission()}
            onRecheck={() => void recheck()}
          />
        )}

        <SafeAreaView
          style={{ position: 'absolute', top: 0, left: 0, right: 0 }}
          edges={['top']}
          pointerEvents="box-none"
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingTop: 8,
            }}
          >
            <RoundButton label="Close" glyph="✕" onPress={onClose} />
            {granted && !scanning && (
              <RoundButton
                label="Switch camera"
                glyph="⟳"
                onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
              />
            )}
          </View>
        </SafeAreaView>

        {/* A window to hold the label in. Purely a sight, so it takes no
            touches — the scanner reads the whole frame regardless. */}
        {granted && scanning && (
          <View
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            pointerEvents="none"
          >
            <View
              style={{
                position: 'absolute',
                top: '34%',
                left: '12%',
                right: '12%',
                height: 150,
                borderRadius: 20,
                borderWidth: 3,
                borderColor: c.accent.lime,
              }}
            />
          </View>
        )}

        {granted && (
          <SafeAreaView
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}
            edges={['bottom']}
            pointerEvents="box-none"
          >
            <Text
              style={{
                color: 'rgba(255,255,255,0.85)',
                fontSize: 13,
                lineHeight: 18,
                textAlign: 'center',
                paddingHorizontal: 36,
                marginBottom: 20,
              }}
            >
              {hint}
            </Text>

            {/* Scanning needs no shutter — there is nothing to press, and a
                button would suggest the reading only happens when you do. */}
            {!scanning && (
              <View style={{ alignItems: 'center', paddingBottom: 28 }}>
                <Pressable
                  onPress={() => void capture()}
                  disabled={capturing}
                  accessibilityRole="button"
                  accessibilityLabel="Take photo"
                  style={{
                    width: 76,
                    height: 76,
                    borderRadius: 38,
                    borderWidth: 4,
                    borderColor: 'rgba(255,255,255,0.9)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {capturing ? (
                    <ActivityIndicator color={c.accent.lime} />
                  ) : (
                    <View
                      style={{
                        width: 58,
                        height: 58,
                        borderRadius: 29,
                        backgroundColor: c.accent.lime,
                      }}
                    />
                  )}
                </Pressable>
              </View>
            )}
          </SafeAreaView>
        )}
      </View>
    </Modal>
  );
}

/** A translucent circular control, legible over whatever the lens is seeing. */
function RoundButton({
  label,
  glyph,
  onPress,
}: {
  label: string;
  glyph: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={10}
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.45)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.25)',
      }}
    >
      <Text style={{ color: '#FFF', fontSize: 17, lineHeight: 20 }}>{glyph}</Text>
    </Pressable>
  );
}

/**
 * What fills the sheet while there is no permission to show a preview with.
 *
 * The two cases need different words and different buttons: one the app can
 * still resolve itself, and one only the system settings can.
 */
function PermissionPanel({
  checking,
  canAskAgain,
  onRequest,
  onRecheck,
}: {
  checking: boolean;
  canAskAgain: boolean;
  onRequest: () => void;
  onRecheck: () => void;
}) {
  const c = useColors();

  if (checking) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.accent.lime} />
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        gap: 14,
      }}
    >
      <Text style={{ fontSize: 40 }}>{'📷'}</Text>

      <Text style={{ color: '#FFF', fontSize: 18, fontWeight: '700', textAlign: 'center' }}>
        {canAskAgain ? 'Camera access needed' : 'Camera access is turned off'}
      </Text>

      <Text
        style={{
          color: 'rgba(255,255,255,0.7)',
          fontSize: 14,
          lineHeight: 20,
          textAlign: 'center',
        }}
      >
        {canAskAgain
          ? 'NutriSnap uses the camera to photograph your meal and estimate what is in it.'
          : 'Your phone will not ask again, so the switch has to be flipped in Settings. NutriSnap only opens the camera when you tap to take a photo.'}
      </Text>

      <Pressable
        onPress={canAskAgain ? onRequest : () => void Linking.openSettings()}
        accessibilityRole="button"
        style={{
          marginTop: 6,
          paddingHorizontal: 22,
          paddingVertical: 13,
          borderRadius: 999,
          backgroundColor: c.accent.lime,
        }}
      >
        <Text style={{ color: '#07090C', fontSize: 15, fontWeight: '700' }}>
          {canAskAgain ? 'Allow camera' : 'Open settings'}
        </Text>
      </Pressable>

      {/* The last resort, and the one that needs nothing to have been
          noticed: the user says they have allowed it, and the app looks
          again. Without this, a missed foreground event strands the sheet
          on this panel until the app is restarted. */}
      <Pressable onPress={onRecheck} accessibilityRole="button" hitSlop={8}>
        <Text
          style={{
            color: 'rgba(255,255,255,0.65)',
            fontSize: 14,
            fontWeight: '600',
            textDecorationLine: 'underline',
          }}
        >
          I&apos;ve allowed it — check again
        </Text>
      </Pressable>
    </View>
  );
}
