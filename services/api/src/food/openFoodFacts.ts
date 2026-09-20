import { HttpError } from '../auth.js';
import type { MacroTotals } from '@nutrisnap/core';

/**
 * Open Food Facts barcode lookup. Free, keyless, and community-maintained,
 * which also means coverage and data quality vary — we surface what is there
 * and let the user correct it, same as an AI estimate.
 */

const BASE_URL = 'https://world.openfoodfacts.org/api/v2/product';

// Open Food Facts asks API users to identify themselves in the User-Agent.
const USER_AGENT = 'NutriSnap/0.1 (calorie tracking app)';

const FIELDS = [
  'product_name',
  'brands',
  'serving_quantity',
  'serving_size',
  'image_front_small_url',
  'nutriments',
].join(',');

export interface BarcodeProduct {
  barcode: string;
  name: string;
  brand: string | null;
  image_url: string | null;
  /** Grams in one serving, when the product declares one. */
  serving_grams: number | null;
  /** Nutrition for one serving if known, otherwise per 100 g. */
  totals: MacroTotals;
  basis: 'serving' | '100g';
}

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number.parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export async function lookupBarcode(barcode: string): Promise<BarcodeProduct> {
  if (!/^\d{6,14}$/.test(barcode)) {
    throw new HttpError(400, 'That barcode does not look valid.', 'invalid_barcode');
  }

  let payload: any;
  try {
    const response = await fetch(`${BASE_URL}/${barcode}?fields=${FIELDS}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (response.status === 404) {
      throw new HttpError(404, 'We could not find that product.', 'barcode_not_found');
    }
    if (!response.ok) {
      throw new HttpError(502, 'The product database is unavailable right now.', 'barcode_unavailable');
    }

    payload = await response.json();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, 'The product database is unavailable right now.', 'barcode_unavailable');
  }

  if (payload?.status !== 1 || !payload?.product) {
    throw new HttpError(404, 'We could not find that product.', 'barcode_not_found');
  }

  const product = payload.product;
  const n = product.nutriments ?? {};

  // Open Food Facts exposes both per-serving and per-100g columns. Prefer
  // per-serving — that is what a user actually eats — and fall back to 100g.
  const hasServing = n['energy-kcal_serving'] !== undefined || n.proteins_serving !== undefined;
  const suffix = hasServing ? '_serving' : '_100g';

  const totals: MacroTotals = {
    calories: num(n[`energy-kcal${suffix}`]),
    protein_g: num(n[`proteins${suffix}`]),
    carbs_g: num(n[`carbohydrates${suffix}`]),
    fat_g: num(n[`fat${suffix}`]),
    sugar_g: num(n[`sugars${suffix}`]),
    fiber_g: num(n[`fiber${suffix}`]),
    sodium_mg: num(n[`sodium${suffix}`]) * 1000, // OFF reports sodium in grams
  };

  if (totals.calories === 0 && totals.protein_g === 0 && totals.carbs_g === 0 && totals.fat_g === 0) {
    throw new HttpError(
      404,
      'We found that product but it has no nutrition data. Try the label scanner instead.',
      'barcode_no_nutrition',
    );
  }

  return {
    barcode,
    name: product.product_name?.trim() || 'Unnamed product',
    brand: product.brands?.split(',')[0]?.trim() || null,
    image_url: product.image_front_small_url ?? null,
    serving_grams: hasServing ? num(product.serving_quantity) || null : 100,
    totals,
    basis: hasServing ? 'serving' : '100g',
  };
}
