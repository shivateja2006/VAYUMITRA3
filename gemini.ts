import {
  GoogleGenAI,
  ThinkingLevel,
  Type,
  type GenerateContentParameters,
  type GenerateContentResponse,
} from '@google/genai';
import type { HouseholdProfile, LocationDetail } from '../src/types/aqi.ts';
import { sanitizeChatHistory, sanitizeText } from './validation.ts';

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in server secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ParsedGeminiError {
  statusCode: number;
  userMessage: string;
  isTransient: boolean;
}

export function parseGeminiError(error: unknown): ParsedGeminiError {
  const rawMessage = error instanceof Error ? error.message : String(error ?? 'Unknown AI error');
  let code =
    typeof (error as { status?: unknown })?.status === 'number'
      ? (error as { status: number }).status
      : 0;
  let apiStatus = '';
  let innerMessage = rawMessage;

  const trimmed = rawMessage.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as {
        error?: { code?: number; message?: string; status?: string };
      };
      if (parsed.error) {
        if (typeof parsed.error.code === 'number') code = parsed.error.code;
        if (typeof parsed.error.status === 'string') apiStatus = parsed.error.status;
        if (typeof parsed.error.message === 'string') innerMessage = parsed.error.message;
      }
    } catch {
      // Keep rawMessage if not valid JSON
    }
  }

  if (/GEMINI_API_KEY is not configured/i.test(rawMessage)) {
    return {
      statusCode: 503,
      userMessage: 'Gemini API key is not configured yet. Please add GEMINI_API_KEY in Settings > Secrets.',
      isTransient: false,
    };
  }

  if (
    code === 403 ||
    apiStatus === 'PERMISSION_DENIED' ||
    /API_KEY_INVALID|PERMISSION_DENIED|API key not valid/i.test(rawMessage)
  ) {
    return {
      statusCode: 403,
      userMessage:
        'Gemini API access was denied for the configured key. Please verify your API key in Settings > Secrets.',
      isTransient: false,
    };
  }

  if (code === 404 || apiStatus === 'NOT_FOUND') {
    return {
      statusCode: 404,
      userMessage: 'The requested Gemini model endpoint was not found. Please retry shortly.',
      isTransient: false,
    };
  }

  if (code === 429 || apiStatus === 'RESOURCE_EXHAUSTED') {
    return {
      statusCode: 429,
      userMessage:
        'Gemini API rate limit reached for this minute. Please wait a few seconds and click Refresh GenAI Plan.',
      isTransient: true,
    };
  }

  if (
    code === 503 ||
    code === 502 ||
    code === 504 ||
    apiStatus === 'UNAVAILABLE' ||
    /high demand|unavailable|overloaded|temporarily|timed out|ECONNRESET|ETIMEDOUT|fetch failed/i.test(
      rawMessage,
    )
  ) {
    return {
      statusCode: 503,
      userMessage:
        'Vayumitra AI is experiencing temporary high demand across Gemini servers. Please wait a moment and click Refresh GenAI Plan.',
      isTransient: true,
    };
  }

  if (code === 400 || apiStatus === 'INVALID_ARGUMENT') {
    return {
      statusCode: 400,
      userMessage: innerMessage || 'Invalid request sent to Gemini API.',
      isTransient: false,
    };
  }

  return {
    statusCode: code >= 400 && code < 600 ? code : 502,
    userMessage: innerMessage || 'Vayumitra AI service could not respond right now. Please retry.',
    isTransient: false,
  };
}

let primaryModelCooldownUntil = 0;

export function resetGeminiCooldown(): void {
  primaryModelCooldownUntil = 0;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, controller: AbortController): Promise<T> {
  if (timeoutMs <= 0) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`Gemini request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export async function generateContentWithRetry(
  ai: Pick<GoogleGenAI, 'models'>,
  params: Omit<GenerateContentParameters, 'model'>,
  sleepFn: (ms: number) => Promise<void> = defaultSleep,
  options: {
    attemptTimeoutMs?: number;
    fallbackTimeoutMs?: number;
    enableCooldown?: boolean;
    maxPrimaryAttempts?: number;
  } = {},
): Promise<GenerateContentResponse> {
  const attemptTimeoutMs = options.attemptTimeoutMs ?? 9000;
  const fallbackTimeoutMs = options.fallbackTimeoutMs ?? 25000;
  const enableCooldown = options.enableCooldown ?? false;
  const maxAttempts = options.maxPrimaryAttempts ?? 3;
  let lastError: unknown;

  const skipPrimary = enableCooldown && Date.now() < primaryModelCooldownUntil;

  if (!skipPrimary) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const controller = new AbortController();
      try {
        return await withTimeout(
          ai.models.generateContent({
            ...params,
            model: 'gemini-4-hydrogen',
            config: {
              ...params.config,
              abortSignal: controller.signal,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          }),
          attemptTimeoutMs,
          controller,
        );
      } catch (error) {
        lastError = error;
        const parsed = parseGeminiError(error);
        if (!parsed.isTransient) {
          throw error;
        }
        if (attempt < maxAttempts - 1) {
          const delayMs = 500 * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
          await sleepFn(delayMs);
        }
      }
    }

    if (enableCooldown) {
      primaryModelCooldownUntil = Date.now() + 3 * 60 * 1000;
    }
  }

  for (let fallbackAttempt = 0; fallbackAttempt < 2; fallbackAttempt++) {
    const fallbackController = new AbortController();
    try {
      return await withTimeout(
        ai.models.generateContent({
          ...params,
          model: 'gemini-3.1-flash-lite',
          config: {
            ...params.config,
            abortSignal: fallbackController.signal,
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
          },
        }),
        fallbackTimeoutMs,
        fallbackController,
      );
    } catch (fallbackError) {
      lastError = fallbackError;
      const parsed = parseGeminiError(fallbackError);
      if (!parsed.isTransient || fallbackAttempt === 1) {
        throw fallbackError ?? lastError;
      }
      await sleepFn(400);
    }
  }

  throw lastError;
}

export const PLAN_SYSTEM_INSTRUCTION =
  'You are Vayumitra, an Indian Urban Air Quality Assistant helping families and Resident Welfare Associations (RWAs) navigate winter smog and urban air pollution across Indian cities. Provide practical, culturally grounded advice with clear quantitative impact explanations.';

export const CHAT_SYSTEM_INSTRUCTION =
  'You are Vayumitra, an Indian Urban Air Quality Assistant helping families navigate winter smog and urban air pollution across India. Answer concisely (under 180 words) with actionable steps tailored to Indian homes/commutes and a clear sentence explaining the direct health or emissions impact of the recommended choice.';

export const PLAN_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    locationBrief: { type: Type.STRING },
    winterSmogDynamics: { type: Type.STRING },
    maskAndOutdoorRule: { type: Type.STRING },
    dailyRoutines: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          timeWindow: { type: Type.STRING },
          title: { type: Type.STRING },
          action: { type: Type.STRING },
          whyItMatters: { type: Type.STRING },
          exposureReductionPct: { type: Type.NUMBER },
          co2SavedKgPerWeek: { type: Type.NUMBER },
        },
        required: [
          'id',
          'timeWindow',
          'title',
          'action',
          'whyItMatters',
          'exposureReductionPct',
          'co2SavedKgPerWeek',
        ],
      },
    },
    indoorHacks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          title: { type: Type.STRING },
          costTier: { type: Type.STRING },
          steps: { type: Type.STRING },
          indoorPmReductionPct: { type: Type.NUMBER },
          directImpact: { type: Type.STRING },
        },
        required: [
          'id',
          'title',
          'costTier',
          'steps',
          'indoorPmReductionPct',
          'directImpact',
        ],
      },
    },
    sustainableAlternatives: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          category: { type: Type.STRING },
          replaces: { type: Type.STRING },
          alternative: { type: Type.STRING },
          directHealthImpact: { type: Type.STRING },
          communityEmissionImpact: { type: Type.STRING },
          co2SavedKgPerWeek: { type: Type.NUMBER },
        },
        required: [
          'id',
          'category',
          'replaces',
          'alternative',
          'directHealthImpact',
          'communityEmissionImpact',
          'co2SavedKgPerWeek',
        ],
      },
    },
    impactSummary: { type: Type.STRING },
  },
  required: [
    'locationBrief',
    'winterSmogDynamics',
    'maskAndOutdoorRule',
    'dailyRoutines',
    'indoorHacks',
    'sustainableAlternatives',
    'impactSummary',
  ],
};

export function buildPlanPrompt(
  location: LocationDetail,
  profile?: Partial<HouseholdProfile>,
): string {
  const city = sanitizeText(location.name, 80, 'Delhi');
  const region = sanitizeText(location.region, 80, 'India');
  const tier = sanitizeText(location.tier, 30, 'Moderate');
  const dominant = sanitizeText(location.dominantPollutant, 20, 'PM2.5');
  const bestWindow = sanitizeText(location.bestVentilationWindow, 60, '13:00 – 16:00');
  const peakWindow = sanitizeText(location.peakSmogWindow, 60, '06:00 – 09:00');

  const householdType = sanitizeText(
    profile?.householdType,
    120,
    'Family with young children',
  );
  const commuteMode = sanitizeText(profile?.commuteMode, 120, 'Metro / city bus transit');
  const homeSetup = sanitizeText(
    profile?.homeSetup,
    120,
    'Cross-ventilation windows & LPG gas stove',
  );
  const primaryGoal = sanitizeText(
    profile?.primaryGoal,
    120,
    'Protect family health & cut daily emissions',
  );

  return `
Generate a hyper-practical, Indian-city-tailored Vayumitra action plan for this household based on real-time Indian NAQI data:

LOCATION TELEMETRY:
- City: ${city}, ${region}, India
- Live Indian NAQI: ${Math.round(location.aqi)} (${tier})
- PM2.5: ${Number(location.pm25 ?? 0)} µg/m³ | PM10: ${Number(location.pm10 ?? 0)} µg/m³ | NO2: ${Number(location.no2 ?? 0)} µg/m³ | O3: ${Number(location.o3 ?? 0)} µg/m³
- Dominant Pollutant: ${dominant}
- Best Ventilation Window Today: ${bestWindow}
- Peak Smog Window Today: ${peakWindow}

HOUSEHOLD & LIFESTYLE PROFILE:
- Household Composition: ${householdType}
- Primary Commute: ${commuteMode}
- Home Ventilation & Cooking: ${homeSetup}
- Priority Goal: ${primaryGoal}

INSTRUCTIONS:
1. Return exactly 3 concise dailyRoutines, 3 concise indoorHacks, and 3 concise sustainableAlternatives. Keep every text field crisp (10–18 words) so families can scan quickly.
2. Tailor advice specifically to Indian urban living (winter boundary-layer inversions, morning school commutes, Metro/bus/auto-rickshaw/EV choices, wet mopping dust suppression, kitchen exhaust/tadka aerosol control, sealing balcony door gaps, N95/FFP2 masking, avoiding waste/leaf burning).
3. If NAQI is Good/Satisfactory (0–100), emphasize preserving clean air, safe morning/evening walks, and low-emission transport habits.
4. If NAQI is Poor/Very Poor/Severe (>200), prioritize immediate exposure protection (fitted N95 mask outdoors, HEPA or DIY box-fan filter indoors, avoiding dawn/late-night inversion outdoor exercise, switching short car trips to Metro/carpool).
5. Include realistic quantitative estimates for exposureReductionPct (5 to 45), indoorPmReductionPct (10 to 70), and co2SavedKgPerWeek (1 to 25).
  `.trim();
}

export function buildChatPrompt(params: {
  question: string;
  location?: LocationDetail | null;
  profile?: Partial<HouseholdProfile>;
  history?: unknown;
}): string {
  const { question, location, profile, history } = params;

  const contextBlock = location
    ? `Active Indian City: ${sanitizeText(location.name, 80)}, ${sanitizeText(
        location.region,
        80,
      )} | Indian NAQI: ${Math.round(Number(location.aqi ?? 0))} (${sanitizeText(
        location.tier,
        30,
      )}) | PM2.5: ${Number(location.pm25 ?? 0)} µg/m³ | PM10: ${Number(
        location.pm10 ?? 0,
      )} µg/m³ | NO2: ${Number(location.no2 ?? 0)} µg/m³ | Best Ventilation Window: ${sanitizeText(
        location.bestVentilationWindow,
        60,
      )} | Peak Smog Window: ${sanitizeText(location.peakSmogWindow, 60)}.`
    : 'No active city selected.';

  const recentHistory = sanitizeChatHistory(history)
    .map((m) => `${m.role === 'user' ? 'Family' : 'Vayumitra'}: ${m.content}`)
    .join('\n');

  const household = sanitizeText(profile?.householdType, 120, 'Indian family');
  const commute = sanitizeText(profile?.commuteMode, 120, 'Mixed');
  const homeSetup = sanitizeText(profile?.homeSetup, 120, 'Apartment');

  return `
${contextBlock}
Household Profile: ${household}, Commute: ${commute}, Home Setup: ${homeSetup}.

${recentHistory ? `Recent Conversation:\n${recentHistory}\n\n` : ''}Family Question: ${question}
  `.trim();
}
