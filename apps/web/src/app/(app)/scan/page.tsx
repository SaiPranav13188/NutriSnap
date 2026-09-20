'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Barcode, Camera, ImageUp, ScanText, Type } from 'lucide-react';
import type { FoodAnalysis } from '@nutrisnap/core';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { GlassCard } from '@/components/ui/GlassCard';
import { ScanResult } from '@/components/scan/ScanResult';
import { ScanningOverlay } from '@/components/scan/ScanningOverlay';
import { cn } from '@/lib/cn';

type Mode = 'photo' | 'barcode' | 'label' | 'text';

const MODES: Array<{ value: Mode; label: string; icon: typeof Camera }> = [
  { value: 'photo', label: 'Scan food', icon: Camera },
  { value: 'barcode', label: 'Barcode', icon: Barcode },
  { value: 'label', label: 'Food label', icon: ScanText },
  { value: 'text', label: 'Describe', icon: Type },
];

function ScanPage() {
  const router = useRouter();
  const params = useSearchParams();

  const [mode, setMode] = useState<Mode>((params.get('mode') as Mode) ?? 'photo');
  const [analysis, setAnalysis] = useState<FoodAnalysis | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [lastImage, setLastImage] = useState<{ base64: string; mediaType: string } | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [description, setDescription] = useState('');
  const [barcode, setBarcode] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Revoke the object URL when it is replaced or the page unmounts.
  useEffect(() => {
    return () => {
      if (previewSrc) URL.revokeObjectURL(previewSrc);
    };
  }, [previewSrc]);

  const readFile = (file: File): Promise<{ base64: string; mediaType: string }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result);
        const base64 = result.split(',')[1] ?? '';
        resolve({ base64, mediaType: file.type || 'image/jpeg' });
      };
      reader.onerror = () => reject(new Error('Could not read that file.'));
      reader.readAsDataURL(file);
    });

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setAnalyzing(true);

      const objectUrl = URL.createObjectURL(file);
      setPreviewSrc(objectUrl);

      try {
        const image = await readFile(file);
        setLastImage(image);

        const result =
          mode === 'label'
            ? await api.analyzeLabel({ image: image.base64, media_type: image.mediaType })
            : await api.analyzePhoto({ image: image.base64, media_type: image.mediaType });

        setAnalysis(result.analysis);
        setPhotoUrl(result.photo_url);
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'Could not analyse that photo.');
        setPreviewSrc(null);
      } finally {
        setAnalyzing(false);
      }
    },
    [mode],
  );

  async function handleText() {
    if (description.trim().length < 2) return;
    setError(null);
    setAnalyzing(true);
    try {
      const result = await api.analyzeText(description.trim());
      setAnalysis(result.analysis);
      setPhotoUrl(null);
      setPreviewSrc(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not read that description.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleBarcode() {
    if (!/^\d{6,14}$/.test(barcode)) {
      setError('Enter the digits printed under the barcode.');
      return;
    }
    setError(null);
    setAnalyzing(true);
    try {
      const result = await api.lookupBarcode(barcode);
      setAnalysis(result.analysis);
      setPhotoUrl(null);
      setPreviewSrc(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not look that product up.');
    } finally {
      setAnalyzing(false);
    }
  }

  /** "Fix Results" — send the user's correction back with the same photo. */
  async function handleFix(correction: string) {
    if (!analysis) return;
    setFixing(true);
    setError(null);

    try {
      if (lastImage) {
        const result = await api.analyzePhoto({
          image: lastImage.base64,
          media_type: lastImage.mediaType,
          correction,
          previous: analysis,
          // The photo is already stored; don't upload it a second time.
          store_photo: false,
        });
        setAnalysis(result.analysis);
      } else {
        const result = await api.analyzeText(`${analysis.name}. Correction: ${correction}`);
        setAnalysis(result.analysis);
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not re-analyse that.');
    } finally {
      setFixing(false);
    }
  }

  async function handleSave(payload: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      await api.createLog(payload);
      router.push('/dashboard');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save that meal.');
      setSaving(false);
    }
  }

  function reset() {
    setAnalysis(null);
    setPhotoUrl(null);
    setPreviewSrc(null);
    setLastImage(null);
    setError(null);
  }

  if (analysis) {
    return (
      <div className="flex flex-col gap-4">
        <ScanResult
          analysis={analysis}
          photoUrl={photoUrl}
          previewSrc={previewSrc}
          saving={saving}
          fixing={fixing}
          onFix={handleFix}
          onSave={handleSave}
          onDiscard={reset}
        />
        {error && (
          <p className="rounded-2xl bg-state-danger/10 px-4 py-3 text-sm text-state-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Log a meal</h1>
        <p className="mt-1 text-ink-secondary">Photograph it, scan it, or just say what it was.</p>
      </header>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {MODES.map(({ value, label, icon: Icon }) => (
          <button suppressHydrationWarning
            key={value}
            type="button"
            onClick={() => {
              setMode(value);
              setError(null);
            }}
            aria-pressed={mode === value}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-colors',
              mode === value
                ? 'border-accent-lime/60 bg-accent-lime/10 text-ink-primary'
                : 'border-glass-border text-ink-secondary hover:bg-white/[0.06]',
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.22 }}
        >
          {(mode === 'photo' || mode === 'label') && (
            <GlassCard className="relative overflow-hidden p-6">
              <div className="grid aspect-square place-items-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02]">
                {previewSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local object URL
                  <img src={previewSrc} alt="" className="h-full w-full rounded-2xl object-cover" />
                ) : (
                  <div className="px-8 text-center">
                    <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-accent-soft">
                      {mode === 'label' ? (
                        <ScanText className="h-7 w-7 text-accent-lime" aria-hidden />
                      ) : (
                        <Camera className="h-7 w-7 text-accent-lime" aria-hidden />
                      )}
                    </span>
                    <p className="mt-5 font-medium">
                      {mode === 'label' ? 'Photograph the nutrition panel' : 'Take a photo of your meal'}
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">
                      {mode === 'label'
                        ? 'Get the whole panel in frame and keep it flat.'
                        : 'Shoot from above, and include a fork or your hand so we can judge the portion.'}
                    </p>
                  </div>
                )}

                {analyzing && <ScanningOverlay label={mode === 'label' ? 'Reading the label…' : undefined} />}
              </div>

              <input suppressHydrationWarning
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  e.target.value = '';
                }}
              />

              <div className="mt-5 grid grid-cols-2 gap-2.5">
                <Button
                  size="lg"
                  loading={analyzing}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="h-4 w-4" aria-hidden />
                  Take photo
                </Button>
                <Button
                  size="lg"
                  variant="glass"
                  disabled={analyzing}
                  onClick={() => {
                    // Same picker without `capture`, so it offers the library.
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = () => {
                      const file = input.files?.[0];
                      if (file) void handleFile(file);
                    };
                    input.click();
                  }}
                >
                  <ImageUp className="h-4 w-4" aria-hidden />
                  Upload
                </Button>
              </div>
            </GlassCard>
          )}

          {mode === 'text' && (
            <GlassCard className="p-6">
              <label className="block">
                <span className="text-sm font-medium">What did you eat?</span>
                <textarea suppressHydrationWarning
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  maxLength={500}
                  placeholder="Two scrambled eggs, a slice of sourdough with butter, and a flat white"
                  className="mt-3 w-full resize-none rounded-2xl border border-glass-border bg-white/[0.04] p-4 text-[15px] leading-relaxed outline-none transition-colors focus:border-accent-lime/50"
                />
              </label>

              <p className="mt-2 text-[12px] text-ink-tertiary">
                Mention quantities where you know them — it makes the estimate much better.
              </p>

              <Button
                size="lg"
                fullWidth
                className="mt-4"
                loading={analyzing}
                disabled={description.trim().length < 2}
                onClick={handleText}
              >
                Work out the macros
              </Button>
            </GlassCard>
          )}

          {mode === 'barcode' && (
            <GlassCard className="p-6">
              <label className="block">
                <span className="text-sm font-medium">Barcode number</span>
                <input suppressHydrationWarning
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                  maxLength={14}
                  placeholder="5000112637922"
                  className="tnum mt-3 h-14 w-full rounded-2xl border border-glass-border bg-white/[0.04] px-4 text-center text-xl tracking-wider outline-none transition-colors focus:border-accent-lime/50"
                />
              </label>

              <p className="mt-2.5 text-[12px] leading-relaxed text-ink-tertiary">
                Type the digits printed under the barcode. Data comes from Open Food Facts, so
                coverage depends on what the community has catalogued.
              </p>

              <Button
                size="lg"
                fullWidth
                className="mt-4"
                loading={analyzing}
                disabled={barcode.length < 6}
                onClick={handleBarcode}
              >
                Look it up
              </Button>
            </GlassCard>
          )}
        </motion.div>
      </AnimatePresence>

      {error && (
        <p className="rounded-2xl bg-state-danger/10 px-4 py-3 text-sm text-state-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="skeleton h-96 rounded-2xl" />}>
      <ScanPage />
    </Suspense>
  );
}
