import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineRoute } from '../src/http/define-route.js';
import { AppError, notFound } from '../src/lib/errors.js';
import { buildTestApp } from './helpers.js';

const echoRoute = defineRoute({
  method: 'post',
  path: '/echo/:id',
  summary: 'Echo the validated input',
  tags: ['Test'],
  access: 'public',
  request: {
    params: z.object({ id: z.coerce.number().int().positive() }),
    query: z.object({ verbose: z.enum(['yes', 'no']).default('no') }),
    body: z.object({ name: z.string().trim().min(1) }),
  },
  responses: {
    201: {
      description: 'Echoed',
      schema: z.object({
        data: z.object({ id: z.number(), name: z.string(), verbose: z.string() }),
      }),
    },
  },
  handler: ({ input }) => ({
    data: { id: input.params.id, name: input.body.name, verbose: input.query.verbose },
  }),
});

const failingRoutes = [
  defineRoute({
    method: 'get',
    path: '/boom',
    summary: 'Throws an unexpected error',
    tags: ['Test'],
    access: 'public',
    responses: { 200: { description: 'Never' } },
    handler: () => {
      throw new Error('database password is hunter2');
    },
  }),
  defineRoute({
    method: 'get',
    path: '/missing',
    summary: 'Throws a client error',
    tags: ['Test'],
    access: 'public',
    responses: { 200: { description: 'Never' } },
    handler: () => {
      throw notFound('No such employee');
    },
  }),
  defineRoute({
    method: 'get',
    path: '/locked',
    summary: 'Throws with headers',
    tags: ['Test'],
    access: 'public',
    responses: { 200: { description: 'Never' } },
    handler: () => {
      throw new AppError('RATE_LIMITED', { headers: { 'Retry-After': '60' } });
    },
  }),
  defineRoute({
    method: 'get',
    path: '/drift',
    summary: 'Returns a body that breaks its schema',
    tags: ['Test'],
    access: 'public',
    responses: { 200: { description: 'Typed', schema: z.object({ data: z.number() }) } },
    handler: () => ({ data: 'not a number' }),
  }),
  defineRoute({
    method: 'delete',
    path: '/things/:id',
    summary: 'No content',
    tags: ['Test'],
    access: 'public',
    responses: { 204: { description: 'Deleted' } },
    handler: () => undefined,
  }),
];

const app = buildTestApp({ routes: [echoRoute, ...failingRoutes] });

describe('request pipeline', () => {
  it('validates and transforms params, query and body', async () => {
    const response = await request(app).post('/api/v1/echo/7?verbose=yes').send({ name: '  Ada ' });
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ data: { id: 7, name: 'Ada', verbose: 'yes' } });
  });

  it('reports every invalid field with its location', async () => {
    const response = await request(app).post('/api/v1/echo/abc').send({ name: '' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
    expect(response.body.error.details.map((/** @type {{ path: string }} */ d) => d.path)).toEqual([
      'params.id',
    ]);
  });

  it('rejects malformed JSON with a validation error', async () => {
    const response = await request(app)
      .post('/api/v1/echo/1')
      .set('Content-Type', 'application/json')
      .send('{"name":');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 204 with no body', async () => {
    const response = await request(app).delete('/api/v1/things/1');
    expect(response.status).toBe(204);
    expect(response.text).toBe('');
  });
});

describe('error handling', () => {
  it('hides internal errors and includes the request id', async () => {
    const response = await request(app).get('/api/v1/boom');
    expect(response.status).toBe(500);
    expect(response.body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: expect.any(String),
      requestId: response.headers['x-request-id'],
    });
    expect(JSON.stringify(response.body)).not.toContain('hunter2');
    expect(JSON.stringify(response.body)).not.toContain('at ');
  });

  it('maps AppError to its status and message', async () => {
    const response = await request(app).get('/api/v1/missing');
    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'No such employee' });
  });

  it('sends extra headers from AppError', async () => {
    const response = await request(app).get('/api/v1/locked');
    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBe('60');
  });

  it('fails loudly when a response drifts from its schema outside production', async () => {
    const response = await request(app).get('/api/v1/drift');
    expect(response.status).toBe(500);
  });

  it('returns NOT_FOUND for unknown routes', async () => {
    const response = await request(app).get('/api/v1/nope');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});

describe('request id', () => {
  it('reuses a safe incoming id', async () => {
    const response = await request(app).get('/health/live').set('X-Request-Id', 'abc-12345678');
    expect(response.headers['x-request-id']).toBe('abc-12345678');
  });

  it('replaces an unsafe incoming id', async () => {
    const response = await request(app).get('/health/live').set('X-Request-Id', '<script>');
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('security headers and CORS', () => {
  it('sets helmet headers and hides the framework', async () => {
    const response = await request(app).get('/health/live');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain("default-src 'self'");
  });

  it('allows listed origins with credentials', async () => {
    const response = await request(app).get('/health/live').set('Origin', 'http://localhost:5173');
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not allow other origins', async () => {
    const response = await request(app).get('/health/live').set('Origin', 'https://evil.example');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('health', () => {
  it('reports liveness', async () => {
    const response = await request(app).get('/health/live');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('reports readiness when dependencies answer', async () => {
    const response = await request(app).get('/health/ready');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', checks: { database: 'ok', redis: 'ok' } });
  });

  it('reports 503 when a dependency is down', async () => {
    const downApp = buildTestApp({
      redis: { ping: async () => Promise.reject(new Error('down')) },
    });
    const response = await request(downApp).get('/health/ready');
    expect(response.status).toBe(503);
    expect(response.body.checks).toEqual({ database: 'ok', redis: 'error' });
  });
});

describe('OpenAPI', () => {
  it('documents every route from its definition', async () => {
    const response = await request(app).get('/api/v1/openapi.json');
    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe('3.1.0');
    const operation = response.body.paths['/api/v1/echo/{id}'].post;
    expect(operation.summary).toBe('Echo the validated input');
    expect(operation.requestBody.content['application/json'].schema).toBeDefined();
    expect(Object.keys(operation.responses)).toEqual(['201', 'default']);
  });

  it('serves the API reference page outside production', async () => {
    const response = await request(app).get('/api/docs');
    expect(response.status).toBe(200);
    expect(response.text).toContain('iHealth Pharmacy API');
  });
});
