import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { requireAuth, HttpError } from '../auth.js';
import { analyzeFoodImage, analyzeFoodText, analyzeNutritionLabel } from '../ai/vision.js';
import { lookupBarcode } from '../food/openFoodFacts.js';
import { env } from '../env.js';
import { scaleTotals, type MacroTotals } from '@nutrisnap/core';

/** 10 MB, matching the storage bucket's limit. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const analyzeBody = z.object({
  /** Raw base64, or a data URL — we accept either and normalise. */
  image: z.string().min(32),
  media_type: z.string().default('image/jpeg'),
  /** Set on a "Fix Results" re-analysis. */
  correction: z.string().max(500).optional(),
  previous: z.unknown().optional(),
  /** When true, the photo is stored and its URL returned with the analysis. */
  store_photo: z.boolean().default(true),
});

const textBody = z.object({
  description: z.string().min(2).max(500),
});

/** Strip a `data:image/jpeg;base64,` prefix if the client sent one. */
function normaliseBase64(input: string, fallbackMediaType: string): { base64: string; mediaType: string } {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(input);
  if (match?.[1] && match[2]) {
    return { base64: match[2], mediaType: match[1] };
  }
  return { base64: input, mediaType: fallbackMediaType };
}

function assertSize(base64: string): void {
  // 4 base64 chars encode 3 bytes.
  const approxBytes = Math.floor((base64.length * 3) / 4);
  if (approxBytes > MAX_IMAGE_BYTES) {
    throw new HttpError(413, 'That photo is larger than 10 MB.', 'image_too_large');
  }
}

export async function foodRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  /**
   * The headline endpoint. Photo in, structured macros out, plus a stored
   * photo URL the client can attach when the user hits Done.
   *
   * Note this does NOT write a food_log — the user reviews and edits the
   * result first. POST /api/logs is what commits it.
   */
  app.post('/api/food/analyze', async (request) => {
    const body = analyzeBody.parse(request.body);
    const { base64, mediaType } = normaliseBase64(body.image, body.media_type);
    assertSize(base64);

    const analysis = await analyzeFoodImage({
      base64,
      mediaType,
      correction: body.correction,
      previous: body.previous as never,
    });

    let photo_url: string | null = null;

    if (body.store_photo) {
      const extension = mediaType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
      const path = `${request.user.id}/${randomUUID()}.${extension}`;

      const { error } = await request.db.storage
        .from(env.MEAL_PHOTO_BUCKET)
        .upload(path, Buffer.from(base64, 'base64'), {
          contentType: mediaType,
          upsert: false,
        });

      // A failed upload should not lose the user their analysis — the log can
      // be saved without a thumbnail.
      if (error) {
        request.log.warn({ err: error }, 'meal photo upload failed');
      } else {
        photo_url = path;
      }
    }

    return { analysis, photo_url };
  });

  /** Natural-language and voice logging both land here. */
  app.post('/api/food/analyze-text', async (request) => {
    const { description } = textBody.parse(request.body);
    const analysis = await analyzeFoodText(description);
    return { analysis, photo_url: null };
  });

  /** OCR a nutrition facts panel. */
  app.post('/api/food/analyze-label', async (request) => {
    const body = analyzeBody.parse(request.body);
    const { base64, mediaType } = normaliseBase64(body.image, body.media_type);
    assertSize(base64);

    const label = await analyzeNutritionLabel({ base64, mediaType });
    const totals = scaleTotals(label.totals as MacroTotals, label.servings_consumed || 1);

    return {
      analysis: {
        name: label.name,
        confidence: label.confidence,
        estimated_grams: label.serving_size_g * (label.servings_consumed || 1),
        ingredients: [],
        totals,
        notes: 'Read from the printed nutrition label.',
      },
      photo_url: null,
    };
  });

  /** Packaged products via Open Food Facts. */
  app.get('/api/food/barcode/:code', async (request) => {
    const { code } = z.object({ code: z.string() }).parse(request.params);
    const product = await lookupBarcode(code);

    return {
      analysis: {
        name: product.brand ? `${product.brand} ${product.name}` : product.name,
        confidence: 0.95, // printed label data, not an estimate
        estimated_grams: product.serving_grams ?? 100,
        ingredients: [],
        totals: product.totals,
        notes:
          product.basis === '100g'
            ? 'Values are per 100 g — adjust the serving size to match what you ate.'
            : 'Values are per serving as printed on the package.',
      },
      product,
      photo_url: null,
    };
  });

  /** A signed URL for a stored meal photo, for rendering thumbnails. */
  app.get('/api/food/photo-url', async (request) => {
    const { path } = z.object({ path: z.string().min(1) }).parse(request.query);

    if (!path.startsWith(`${request.user.id}/`)) {
      throw new HttpError(403, 'That photo does not belong to you.', 'forbidden');
    }

    const { data, error } = await request.db.storage
      .from(env.MEAL_PHOTO_BUCKET)
      .createSignedUrl(path, 3600);

    if (error || !data) throw new HttpError(404, 'Photo not found.', 'photo_not_found');
    return { url: data.signedUrl };
  });
}
