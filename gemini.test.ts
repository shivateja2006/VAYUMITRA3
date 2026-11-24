import { describe, expect, it, vi } from 'vitest';
import {
  buildChatPrompt,
  buildPlanPrompt,
  generateContentWithRetry,
  parseGeminiError,
  resetGeminiCooldown,
} from '../server/gemini.ts';
import { parseLatLon, sanitizeChatHistory, sanitizeText } from '../server/validation.ts';
import type { LocationDetail } from '../src/types/aqi.ts';

const SAMPLE_LOCATION: LocationDetail = {
  id: 'delhi',
  name: 'Delhi',
  country: 'India',
  region: 'NCR · North',
  lat: 28.6139,
  lon: 77.209,
  isMainCity: true,
  aqi: 318,
  usAqi: 245,
  pm25: 142,
  pm10: 230,
  no2: 68,
  o3: 32,
  co: 1100,
  so2: 15,
  tier: 'Very Poor',
  theme: 'high',
  isDangerous: true,
  dominantPollutant: 'PM2.5',
  updatedAt: '2026-11-24T08:00',
  hourly: [],
  bestVentilationWindow: '14:00 (NAQI ~180)',
  peakSmogWindow: '07:00 (NAQI ~352)',
};

describe('Validation & Sanitization Helpers', () => {
  it('validates numeric geographic coordinates within valid Earth bounds', () => {
    expect(parseLatLon('28.6139', '77.209')).toEqual({ lat: 28.6139, lon: 77.209 });
    expect(parseLatLon('', '77.2')).toBeNull();
    expect(parseLatLon('95', '77.2')).toBeNull();
    expect(parseLatLon('28.6', '190')).toBeNull();
    expect(parseLatLon('abc', '77.2')).toBeNull();
  });

  it('strips control characters and enforces max text lengths', () => {
    expect(sanitizeText('  Delhi\n\tNCR\u0007 ', 20)).toBe('Delhi  NCR');
    expect(sanitizeText('abcdef', 3)).toBe('abc');
    expect(sanitizeText(undefined, 10, 'Fallback')).toBe('Fallback');
  });

  it('sanitizes and bounds recent chat history turns', () => {
    const history = sanitizeChatHistory([
      { role: 'user', content: 'Turn 1' },
      { role: 'assistant', content: 'Turn 2' },
      { role: 'user', content: 'Turn 3' },
      { role: 'assistant', content: 'Turn 4' },
      { role: 'user', content: 'Turn 5' },
      { role: 'assistant', content: '  ' },
    ]);
    expect(history).toHaveLength(4);
    expect(history[0].content).toBe('Turn 2');
    expect(history[3].content).toBe('Turn 5');
  });
});

describe('Gemini Error Parsing & Retry Orchestration', () => {
  it('parses raw SDK 503 JSON payloads into user-friendly transient responses', () => {
    const raw503 = new Error(
      JSON.stringify({
        error: {
          code: 503,
          message: 'This model is currently experiencing high demand.',
          status: 'UNAVAILABLE',
        },
      }),
    );
    const parsed = parseGeminiError(raw503);
    expect(parsed.statusCode).toBe(503);
    expect(parsed.isTransient).toBe(true);
    expect(parsed.userMessage).not.toContain('{');
  });

  it('maps 403 permission errors as non-transient', () => {
    const parsed = parseGeminiError(new Error('PERMISSION_DENIED: API key not valid'));
    expect(parsed.statusCode).toBe(403);
    expect(parsed.isTransient).toBe(false);
  });

  it('retries transient 503 errors with backoff and succeeds when upstream recovers', async () => {
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}'))
      .mockResolvedValueOnce({ text: '{"ok":true}' });
    const sleepSpy = vi.fn().mockResolvedValue(undefined);

    const res = await generateContentWithRetry(
      { models: { generateContent } as unknown as never },
      { contents: 'test' },
      sleepSpy,
    );

    expect(res.text).toBe('{"ok":true}');
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(sleepSpy).toHaveBeenCalledTimes(1);
    expect(generateContent.mock.calls[0][0].model).toBe('gemini-4-hydrogen');
  });

  it('falls back to gemini-3.1-flash-lite after 3 transient primary failures', async () => {
    const transientErr = new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}');
    const generateContent = vi
      .fn()
      .mockRejectedValueOnce(transientErr)
      .mockRejectedValueOnce(transientErr)
      .mockRejectedValueOnce(transientErr)
      .mockResolvedValueOnce({ text: 'Recovered on lite' });
    const sleepSpy = vi.fn().mockResolvedValue(undefined);

    const res = await generateContentWithRetry(
      { models: { generateContent } as unknown as never },
      { contents: 'test', config: { systemInstruction: 'sys' } },
      sleepSpy,
    );

    expect(res.text).toBe('Recovered on lite');
    expect(generateContent).toHaveBeenCalledTimes(4);
    expect(generateContent.mock.calls[3][0].model).toBe('gemini-3.1-flash-lite');
  });

  it('does not retry non-transient 403 errors', async () => {
    const generateContent = vi
      .fn()
      .mockRejectedValue(new Error('{"error":{"code":403,"status":"PERMISSION_DENIED"}}'));
    const sleepSpy = vi.fn().mockResolvedValue(undefined);

    await expect(
      generateContentWithRetry(
        { models: { generateContent } as unknown as never },
        { contents: 'test' },
        sleepSpy,
      ),
    ).rejects.toThrow();

    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(sleepSpy).not.toHaveBeenCalled();
  });

  it('constructs contextual plan and chat prompts', () => {
    const planPrompt = buildPlanPrompt(SAMPLE_LOCATION, {
      householdType: 'Elderly or asthma-sensitive household',
      commuteMode: 'Metro / city bus transit',
    });
    expect(planPrompt).toContain('Delhi');
    expect(planPrompt).toContain('318');
    expect(planPrompt).toContain('Elderly or asthma-sensitive household');

    const chatPrompt = buildChatPrompt({
      question: 'Should we run the air purifier all night?',
      location: SAMPLE_LOCATION,
      history: [{ role: 'user', content: 'Earlier question' }],
    });
    expect(chatPrompt).toContain('Should we run the air purifier all night?');
    expect(chatPrompt).toContain('Earlier question');
  });

  it('aborts stalled primary model requests after timeout and falls back to lite with cooldown', async () => {
    resetGeminiCooldown();
    const generateContent = vi.fn().mockImplementation(async ({ model }: { model: string }) => {
      if (model === 'gemini-4-hydrogen') {
        return await new Promise(() => {}); // Simulate stalled upstream model
      }
      return { text: 'Fast lite fallback' };
    });
    const sleepSpy = vi.fn().mockResolvedValue(undefined);

    const first = await generateContentWithRetry(
      { models: { generateContent } as unknown as never },
      { contents: 'test' },
      sleepSpy,
      { attemptTimeoutMs: 25, maxPrimaryAttempts: 2, enableCooldown: true },
    );
    expect(first.text).toBe('Fast lite fallback');
    expect(generateContent).toHaveBeenCalledTimes(3); // 2 timed-out primary + 1 lite fallback

    // Immediate follow-up call skips primary via cooldown and hits lite directly
    const second = await generateContentWithRetry(
      { models: { generateContent } as unknown as never },
      { contents: 'test-2' },
      sleepSpy,
      { attemptTimeoutMs: 25, maxPrimaryAttempts: 2, enableCooldown: true },
    );
    expect(second.text).toBe('Fast lite fallback');
    expect(generateContent).toHaveBeenCalledTimes(4);
    expect(generateContent.mock.calls[3][0].model).toBe('gemini-3.1-flash-lite');

    resetGeminiCooldown();
  });
});
