import { Router } from 'express';
import type { GoogleGenAI } from '@google/genai';
import type {
  AssistantPlanResponse,
  HouseholdProfile,
  LocationDetail,
} from '../../src/types/aqi.ts';
import {
  buildChatPrompt,
  buildPlanPrompt,
  CHAT_SYSTEM_INSTRUCTION,
  generateContentWithRetry,
  parseGeminiError,
  PLAN_RESPONSE_SCHEMA,
  PLAN_SYSTEM_INSTRUCTION,
} from '../gemini.ts';
import { sanitizeText } from '../validation.ts';

const PLAN_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Creates Express router for Vayumitra AI household action plan generation and Q&A chat.
 */
export function createAssistantRouter(
  resolveAiClient: () => Pick<GoogleGenAI, 'models'>,
  useCooldown: boolean,
): Router {
  const router = Router();
  const planCache = new Map<string, { plan: AssistantPlanResponse; expiresAt: number }>();
  const inFlightPlans = new Map<string, Promise<AssistantPlanResponse>>();

  router.post('/plan', async (req, res) => {
    try {
      const { location, profile, refresh } = (req.body ?? {}) as {
        location?: LocationDetail;
        profile?: Partial<HouseholdProfile>;
        refresh?: boolean;
      };

      if (!location || typeof location.aqi !== 'number' || !Number.isFinite(location.aqi)) {
        res.status(400).json({ error: 'Location AQI telemetry is required.' });
        return;
      }

      const cityName = sanitizeText(location.name, 80, 'Delhi');
      const aqiBucket = Math.round(location.aqi / 10);
      const cacheKey = [
        cityName.toLowerCase(),
        aqiBucket,
        sanitizeText(profile?.householdType, 120, 'default').toLowerCase(),
        sanitizeText(profile?.commuteMode, 120, 'default').toLowerCase(),
        sanitizeText(profile?.homeSetup, 120, 'default').toLowerCase(),
        sanitizeText(profile?.primaryGoal, 120, 'default').toLowerCase(),
      ].join('|');

      if (!refresh) {
        const cached = planCache.get(cacheKey);
        if (cached && cached.expiresAt > Date.now()) {
          res.json({ plan: cached.plan, cached: true });
          return;
        }
      }

      let pending = !refresh ? inFlightPlans.get(cacheKey) : undefined;
      if (!pending) {
        pending = (async () => {
          const ai = resolveAiClient();
          const prompt = buildPlanPrompt(location, profile);

          const response = await generateContentWithRetry(
            ai,
            {
              contents: prompt,
              config: {
                systemInstruction: PLAN_SYSTEM_INSTRUCTION,
                responseMimeType: 'application/json',
                responseSchema: PLAN_RESPONSE_SCHEMA,
              },
            },
            undefined,
            {
              attemptTimeoutMs: 7500,
              fallbackTimeoutMs: 25000,
              maxPrimaryAttempts: 1,
              enableCooldown: useCooldown,
            },
          );

          const rawText = (response.text ?? '')
            .trim()
            .replace(/^```(?:json)?\s*/i, '')
            .replace(/\s*```$/i, '');

          if (!rawText) {
            throw new Error('Empty response received from Gemini model (temporarily unavailable).');
          }

          const parsed = JSON.parse(rawText) as Omit<AssistantPlanResponse, 'city' | 'aqi'>;
          const generatedPlan: AssistantPlanResponse = {
            city: cityName,
            aqi: Math.round(location.aqi),
            ...parsed,
          };

          if (planCache.size >= 50) {
            const oldestKey = planCache.keys().next().value;
            if (oldestKey) planCache.delete(oldestKey);
          }
          planCache.set(cacheKey, {
            plan: generatedPlan,
            expiresAt: Date.now() + PLAN_CACHE_TTL_MS,
          });

          return generatedPlan;
        })();

        inFlightPlans.set(cacheKey, pending);
      }

      try {
        const plan = await pending;
        res.json({ plan });
      } finally {
        if (inFlightPlans.get(cacheKey) === pending) {
          inFlightPlans.delete(cacheKey);
        }
      }
    } catch (error) {
      const parsed = parseGeminiError(error);
      if (parsed.isTransient) {
        console.warn('Vayumitra plan transient upstream error:', parsed.userMessage);
      } else {
        console.error('Vayumitra plan error:', error);
      }
      res.status(parsed.statusCode).json({ error: parsed.userMessage });
    }
  });

  router.post('/chat', async (req, res) => {
    try {
      const { question, location, profile, history } = (req.body ?? {}) as {
        question?: string;
        location?: LocationDetail;
        profile?: Partial<HouseholdProfile>;
        history?: unknown;
      };

      const cleanQuestion = sanitizeText(question, 600);
      if (!cleanQuestion) {
        res.status(400).json({ error: 'A question is required.' });
        return;
      }

      const ai = resolveAiClient();
      const prompt = buildChatPrompt({
        question: cleanQuestion,
        location,
        profile,
        history,
      });

      const response = await generateContentWithRetry(
        ai,
        {
          contents: prompt,
          config: {
            systemInstruction: CHAT_SYSTEM_INSTRUCTION,
          },
        },
        undefined,
        {
          attemptTimeoutMs: 7500,
          fallbackTimeoutMs: 25000,
          maxPrimaryAttempts: 1,
          enableCooldown: useCooldown,
        },
      );

      res.json({ answer: (response.text ?? '').trim() });
    } catch (error) {
      const parsed = parseGeminiError(error);
      if (parsed.isTransient) {
        console.warn('Vayumitra chat transient upstream error:', parsed.userMessage);
      } else {
        console.error('Vayumitra chat error:', error);
      }
      res.status(parsed.statusCode).json({ error: parsed.userMessage });
    }
  });

  return router;
}
