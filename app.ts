import express, { type Express } from 'express';
import type { GoogleGenAI } from '@google/genai';
import { getGeminiClient } from './gemini.ts';
import { createAqiRouter } from './routes/aqiRoutes.ts';
import { createAssistantRouter } from './routes/assistantRoutes.ts';
import { createMapsRouter } from './routes/mapsRoutes.ts';

export interface CreateAppOptions {
  aiClientProvider?: () => Pick<GoogleGenAI, 'models'>;
}

/**
 * Constructs and configures the Express application with security headers,
 * telemetry routers, Google Maps AQ tile proxy, and Vayumitra GenAI routes.
 */
export function createApp(options: CreateAppOptions = {}): Express {
  const resolveAiClient = options.aiClientProvider ?? getGeminiClient;
  const useCooldown = !options.aiClientProvider;
  const app = express();

  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=()');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    next();
  });
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'vayumitra-india' });
  });

  app.use('/api/maps', createMapsRouter());
  app.use('/api', createAqiRouter());
  app.use('/api/assistant', createAssistantRouter(resolveAiClient, useCooldown));

  return app;
}
