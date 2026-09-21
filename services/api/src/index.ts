import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { ZodError } from 'zod';
import { corsOrigins, env, isProduction } from './env.js';
import { HttpError } from './auth.js';
import { profileRoutes } from './routes/profile.js';
import { foodRoutes } from './routes/food.js';
import { logRoutes } from './routes/logs.js';
import { progressRoutes } from './routes/progress.js';
import { activityRoutes } from './routes/activity.js';
import { photoRoutes } from './routes/photos.js';
import { coachRoutes } from './routes/coach.js';
import { rolloverRoutes } from './routes/rollover.js';

const app = Fastify({
  logger: isProduction
    ? true
    : { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } },
  // Food photos arrive as base64 JSON, which inflates them by about a third.
  bodyLimit: 15 * 1024 * 1024,
  trustProxy: true,
});

await app.register(cors, {
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
});

await app.register(rateLimit, {
  max: 120,
  timeWindow: '1 minute',
  // Rate limit per user where we know who they are, per IP otherwise.
  keyGenerator: (request) => request.headers.authorization ?? request.ip,
});

/**
 * One error shape for every failure, so both clients can render errors the
 * same way. Unexpected errors are logged in full but reported generically.
 */
app.setErrorHandler((error, request, reply) => {
  if (error instanceof HttpError) {
    return reply.code(error.statusCode).send({
      error: { message: error.message, code: error.code ?? 'error' },
    });
  }

  if (error instanceof ZodError) {
    return reply.code(400).send({
      error: {
        message: 'Some of those values were not valid.',
        code: 'validation_failed',
        issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
  }

  // Fastify's own errors (body too large, malformed JSON, rate limit) carry a
  // statusCode; anything 4xx is the caller's to fix, so report it as-is.
  const fastifyError = error as { statusCode?: number; message?: string; code?: string };
  if (fastifyError.statusCode && fastifyError.statusCode < 500) {
    return reply.code(fastifyError.statusCode).send({
      error: { message: fastifyError.message ?? 'Bad request.', code: fastifyError.code ?? 'error' },
    });
  }

  request.log.error({ err: error }, 'unhandled error');
  return reply.code(500).send({
    error: { message: 'Something went wrong on our end.', code: 'internal_error' },
  });
});

app.setNotFoundHandler((request, reply) =>
  reply.code(404).send({ error: { message: `No route for ${request.method} ${request.url}`, code: 'not_found' } }),
);

/** Render pings this to decide whether the service is healthy. */
app.get('/health', async () => ({ status: 'ok', uptime: process.uptime() }));

await app.register(profileRoutes);
await app.register(foodRoutes);
await app.register(logRoutes);
await app.register(progressRoutes);
await app.register(activityRoutes);
await app.register(photoRoutes);
await app.register(coachRoutes);
await app.register(rolloverRoutes);

try {
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`NutriSnap API listening on ${env.HOST}:${env.PORT}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    app.log.info(`${signal} received, shutting down`);
    await app.close();
    process.exit(0);
  });
}
