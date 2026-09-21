import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { requireAuth, HttpError } from '../auth.js';

/**
 * Progress photos.
 *
 * The bytes go to the same private bucket meal photos use, under a progress/
 * prefix, and the table is the index. Reads hand back signed URLs rather than
 * paths, because the bucket is private and a path is not fetchable — the meal
 * report screen learned that the hard way.
 */

const MAX_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_TTL_SECONDS = 3600;

const uploadBody = z.object({
  /** Base64, without the data: prefix. */
  image: z.string().min(1),
  media_type: z.string().default('image/jpeg'),
  weight_kg: z.number().min(25).max(400).nullable().optional(),
  note: z.string().max(300).nullable().optional(),
  taken_at: z.string().datetime().optional(),
});

interface PhotoRow {
  id: string;
  storage_path: string;
  weight_kg: number | null;
  note: string | null;
  taken_at: string;
  taken_on: string;
}

export async function photoRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAuth);

  /** Newest first, each with a signed URL ready to render. */
  app.get('/api/progress/photos', async (request) => {
    const { limit = 60 } = z
      .object({ limit: z.coerce.number().int().min(1).max(200).optional() })
      .parse(request.query);

    const { data, error } = await request.db
      .from('progress_photos')
      .select('*')
      .eq('user_id', request.user.id)
      .order('taken_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new HttpError(500, `Could not load your photos: ${error.message}`, 'photos_read_failed');
    }

    const rows = (data ?? []) as PhotoRow[];

    // One signing call per photo, in parallel. A photo whose object has gone
    // missing yields a null url rather than failing the whole list.
    const photos = await Promise.all(
      rows.map(async (row) => {
        const { data: signed } = await request.db.storage
          .from(env.MEAL_PHOTO_BUCKET)
          .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);

        return { ...row, url: signed?.signedUrl ?? null };
      }),
    );

    return { photos };
  });

  app.post('/api/progress/photos', async (request, reply) => {
    const body = uploadBody.parse(request.body);

    const buffer = Buffer.from(body.image, 'base64');
    if (buffer.byteLength === 0) {
      throw new HttpError(400, 'That image was empty.', 'empty_image');
    }
    if (buffer.byteLength > MAX_BYTES) {
      throw new HttpError(413, 'That photo is too large. Try a smaller one.', 'image_too_large');
    }

    const extension = body.media_type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
    const path = `${request.user.id}/progress/${randomUUID()}.${extension}`;

    const { error: uploadError } = await request.db.storage
      .from(env.MEAL_PHOTO_BUCKET)
      .upload(path, buffer, { contentType: body.media_type, upsert: false });

    if (uploadError) {
      throw new HttpError(
        500,
        `Could not upload that photo: ${uploadError.message}`,
        'photo_upload_failed',
      );
    }

    const { data, error } = await request.db
      .from('progress_photos')
      .insert({
        user_id: request.user.id,
        storage_path: path,
        weight_kg: body.weight_kg ?? null,
        note: body.note ?? null,
        ...(body.taken_at ? { taken_at: body.taken_at } : {}),
      })
      .select('*')
      .single();

    if (error || !data) {
      // The row is the record of ownership; without it the object is an
      // orphan nothing can reach, so take it back out.
      await request.db.storage.from(env.MEAL_PHOTO_BUCKET).remove([path]);
      throw new HttpError(500, `Could not save that photo: ${error?.message}`, 'photo_write_failed');
    }

    const { data: signed } = await request.db.storage
      .from(env.MEAL_PHOTO_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    return reply.code(201).send({ photo: { ...data, url: signed?.signedUrl ?? null } });
  });

  app.delete('/api/progress/photos/:id', async (request, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const { data, error } = await request.db
      .from('progress_photos')
      .select('storage_path')
      .eq('id', id)
      .eq('user_id', request.user.id)
      .maybeSingle();

    if (error) {
      throw new HttpError(500, `Could not delete that photo: ${error.message}`, 'photos_read_failed');
    }
    if (!data) throw new HttpError(404, 'Photo not found.', 'photo_not_found');

    // Row first: a deleted row with a stray object is invisible clutter, while
    // a surviving row pointing at nothing is a broken thumbnail the user sees.
    const { error: deleteError } = await request.db
      .from('progress_photos')
      .delete()
      .eq('id', id)
      .eq('user_id', request.user.id);

    if (deleteError) {
      throw new HttpError(
        500,
        `Could not delete that photo: ${deleteError.message}`,
        'photo_delete_failed',
      );
    }

    await request.db.storage
      .from(env.MEAL_PHOTO_BUCKET)
      .remove([(data as { storage_path: string }).storage_path]);

    return reply.code(204).send();
  });
}
