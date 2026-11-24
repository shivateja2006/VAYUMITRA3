import { Router } from 'express';
import { getMapsApiKey } from '../googleAq.ts';
import { ALLOWED_AQ_MAP_TYPES } from '../validation.ts';

/**
 * Creates Express router for Google Maps configuration and India CPCB air quality heatmap tiles.
 */
export function createMapsRouter(): Router {
  const router = Router();

  router.get('/config', (_req, res) => {
    res.json({ apiKey: getMapsApiKey() });
  });

  router.get('/aq-tile/:mapType/:z/:x/:y', async (req, res) => {
    const apiKey = getMapsApiKey();
    if (!apiKey) {
      res.status(503).json({ error: 'Google Maps API key not configured' });
      return;
    }

    const { mapType, z, x, y } = req.params;
    if (!ALLOWED_AQ_MAP_TYPES.has(mapType)) {
      res.status(400).json({ error: 'Unsupported air quality map type' });
      return;
    }

    const zoom = Number(z);
    const tx = Number(x);
    const ty = Number(y);
    if (
      !Number.isInteger(zoom) ||
      zoom < 0 ||
      zoom > 16 ||
      !Number.isInteger(tx) ||
      !Number.isInteger(ty) ||
      tx < 0 ||
      ty < 0
    ) {
      res.status(400).json({ error: 'Invalid tile coordinates' });
      return;
    }

    try {
      const tileUrl = `https://airquality.googleapis.com/v1/mapTypes/${encodeURIComponent(
        mapType,
      )}/heatmapTiles/${zoom}/${tx}/${ty}?key=${encodeURIComponent(apiKey)}`;

      const upstream = await fetch(tileUrl, {
        headers: {
          'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (upstream.status === 429) {
        res.status(429).json({ error: 'RESOURCE_EXHAUSTED' });
        return;
      }

      if (!upstream.ok) {
        res.status(upstream.status).end();
        return;
      }

      const contentType = upstream.headers.get('content-type') || 'image/png';
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=900');
      res.send(buf);
    } catch {
      res.status(502).end();
    }
  });

  return router;
}
