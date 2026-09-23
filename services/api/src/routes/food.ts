import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { requireAuth, HttpError } from '../auth.js';
import { analyzeFoodImage, analyzeFoodText, analyzeNutritionLabel } from '../ai/vision.js';
import { lookupBarcode } from '../food/openFoodFacts.js';
import { env } from '../env.js';
import {
  cuisinesForDay,
  mealCalorieBudget,
  rankMenu,
  scaleTotals,
  type MacroTotals,
  type MealBudget,
  type MealSlot,
  type MenuDish,
} from '@nutrisnap/core';
import { suggestMeals } from '../ai/suggest.js';
import { readMenu, MAX_DISHES } from '../ai/menu.js';
import { getOrCreateTargets } from '../services/targets.js';
import { dayWindow } from '../lib/day.js';

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

const menuBody = z.object({
  image: z.string().min(32),
  media_type: z.string().default('image/jpeg'),
  /**
   * Which meal this is. Sent by the client rather than inferred from the
   * clock here, because the budget depends on it and the person holding the
   * menu knows whether they are having lunch better than the server does.
   */
  slot: z.enum(['breakfast', 'lunch', 'dinner']),
  /** Minutes east of UTC, so "today" is the caller's day, not ours. */
  tz_offset: z.coerce.number().int().min(-840).max(840).optional(),
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

interface RemainingToday {
  budget: MealBudget;
  proteinLeftG: number;
  carbsLeftG: number;
  fatLeftG: number;
  dietaryPreference: string | null;
  allergies: string[];
  /** The caller's local date, not ours. */
  date: string;
}

/**
 * How much room is left today, and what this person does not eat.
 *
 * Both features that recommend food need exactly this, worked out exactly
 * this way — suggestions invent a dish to fit the gap, the menu reader picks
 * one off a card to fit the same gap. Keeping one copy is what stops the two
 * screens quietly disagreeing about how many calories are left.
 */
async function remainingToday(
  request: FastifyRequest,
  params: { slot: MealSlot; tzOffset: number },
): Promise<RemainingToday> {
  const targets = await getOrCreateTargets(request.db, request.user.id);
  if (!targets) {
    throw new HttpError(
      409,
      'Finish the quiz first — this needs your calorie target.',
      'no_targets',
    );
  }

  const window = dayWindow(undefined, params.tzOffset);

  const [{ data: logs }, { data: profile }] = await Promise.all([
    request.db
      .from('food_logs')
      .select('calories, protein_g, carbs_g, fat_g')
      .eq('user_id', request.user.id)
      .gte('logged_at', window.from)
      .lt('logged_at', window.to),
    request.db
      .from('profiles')
      .select('dietary_preference, allergies')
      .eq('id', request.user.id)
      .maybeSingle(),
  ]);

  const eaten = (logs ?? []).reduce(
    (sum, row) => ({
      calories: sum.calories + Number(row.calories ?? 0),
      protein_g: sum.protein_g + Number(row.protein_g ?? 0),
      carbs_g: sum.carbs_g + Number(row.carbs_g ?? 0),
      fat_g: sum.fat_g + Number(row.fat_g ?? 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );

  const row = profile as { dietary_preference: string | null; allergies: string[] | null } | null;

  return {
    budget: mealCalorieBudget({
      slot: params.slot,
      remainingKcal: Number(targets.calories) - eaten.calories,
      targetKcal: Number(targets.calories),
    }),
    proteinLeftG: Math.max(0, Number(targets.protein_g) - eaten.protein_g),
    carbsLeftG: Math.max(0, Number(targets.carbs_g) - eaten.carbs_g),
    fatLeftG: Math.max(0, Number(targets.fat_g) - eaten.fat_g),
    dietaryPreference: row?.dietary_preference ?? null,
    allergies: row?.allergies ?? [],
    date: window.date,
  };
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

  /**
   * What to eat next.
   *
   * The calorie range is worked out here, from the day's targets and what has
   * already been logged, and handed to the model as a constraint. Asking it to
   * both do the arithmetic and choose the food gets the arithmetic wrong.
   */
  app.post('/api/food/suggest', async (request) => {
    const { slot, tz_offset, exclude } = z
      .object({
        slot: z.enum(['breakfast', 'lunch', 'dinner']),
        /** Minutes east of UTC, so "today" is the caller's day, not ours. */
        tz_offset: z.coerce.number().int().min(-840).max(840).optional(),
        /** Dishes already on screen, for a "more ideas" request. */
        exclude: z.array(z.string().min(1).max(200)).max(30).optional(),
      })
      .parse(request.body);

    const today = await remainingToday(request, { slot, tzOffset: tz_offset ?? 0 });

    if (today.budget.overspent) {
      return { budget: today.budget, suggestions: [] };
    }

    const { suggestions } = await suggestMeals({
      slot,
      minKcal: today.budget.min,
      maxKcal: today.budget.max,
      proteinLeftG: today.proteinLeftG,
      carbsLeftG: today.carbsLeftG,
      fatLeftG: today.fatLeftG,
      dietaryPreference: today.dietaryPreference,
      allergies: today.allergies,
      // Seeds the day-to-day variation, and it has to be the caller's date:
      // ours rolls over at a different hour for anyone outside UTC.
      today: today.date,
      // Rotated by date and meal, so the set moves on without anyone asking.
      cuisines: cuisinesForDay(today.date, slot),
      exclude,
    });

    return { budget: today.budget, suggestions };
  });

  /**
   * Point the camera at a restaurant menu and get it ranked.
   *
   * The model reads the card and estimates each dish; the ordering is done
   * here against the same budget the suggestion engine uses. Unlike the other
   * image routes this one stores nothing — a photograph of a menu is not a
   * meal, and keeping it would be collecting pictures of restaurants for no
   * reason anybody could point to.
   */
  app.post('/api/food/analyze-menu', async (request) => {
    const body = menuBody.parse(request.body);
    const { base64, mediaType } = normaliseBase64(body.image, body.media_type);
    assertSize(base64);

    const today = await remainingToday(request, {
      slot: body.slot,
      tzOffset: body.tz_offset ?? 0,
    });

    const menu = await readMenu({
      base64,
      mediaType,
      dietaryPreference: today.dietaryPreference,
      allergies: today.allergies,
    });

    // The cap is in the prompt, but a model that overruns it should not be
    // able to turn one photograph into an unbounded response.
    const dishes: MenuDish[] = menu.dishes.slice(0, MAX_DISHES).map((dish) => ({
      name: dish.name,
      description: dish.description,
      section: dish.section.trim() === '' ? null : dish.section,
      calories: dish.calories,
      protein_g: dish.protein_g,
      carbs_g: dish.carbs_g,
      fat_g: dish.fat_g,
      fiber_g: dish.fiber_g,
      conflicts: dish.conflicts,
      confidence: dish.confidence,
    }));

    return {
      venue: menu.venue.trim() === '' ? null : menu.venue,
      budget: today.budget,
      protein_left_g: Math.round(today.proteinLeftG),
      dishes: rankMenu(dishes, {
        budget: today.budget,
        proteinLeftG: today.proteinLeftG,
      }),
    };
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
