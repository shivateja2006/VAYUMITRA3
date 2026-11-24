/// <reference types="google.maps" />
import { useCallback, useEffect, useState } from 'react';
import { AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { MapPin } from 'lucide-react';
import type { AqiThemeMode } from '../../types/aqi';

export type HeatmapLayerType = 'IND_CPCB' | 'US_AQI' | 'PM25_INDIGO_PERSIAN';

function getPinPalette(theme: AqiThemeMode): {
  bg: string;
  border: string;
  text: string;
} {
  if (theme === 'high') {
    return { bg: '#dc2626', border: '#7f1d1d', text: '#ffffff' };
  }
  if (theme === 'moderate') {
    return { bg: '#d97706', border: '#78350f', text: '#ffffff' };
  }
  return { bg: '#0d9488', border: '#064e3b', text: '#ffffff' };
}

export function AqHeatmapOverlay({
  enabled,
  layerType,
}: {
  enabled: boolean;
  layerType: HeatmapLayerType;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps) return;

    map.overlayMapTypes.clear();
    if (!enabled) return;

    const aqLayer = new google.maps.ImageMapType({
      getTileUrl: (coord, zoom) => {
        if (zoom < 0 || zoom > 16) return null;
        const numTiles = 1 << zoom;
        if (coord.y < 0 || coord.y >= numTiles) return null;
        const x = ((coord.x % numTiles) + numTiles) % numTiles;
        return `/api/maps/aq-tile/${layerType}/${zoom}/${x}/${coord.y}`;
      },
      tileSize: new google.maps.Size(256, 256),
      maxZoom: 16,
      minZoom: 0,
      name: 'India Air Quality Heatmap',
      opacity: 0.56,
    });

    map.overlayMapTypes.insertAt(0, aqLayer);
    return () => {
      map.overlayMapTypes.clear();
    };
  }, [map, enabled, layerType]);

  return null;
}

export function MapCameraSync({
  center,
  zoom,
}: {
  center: { lat: number; lng: number };
  zoom: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    map.panTo(center);
    map.setZoom(zoom);
  }, [map, center, zoom]);

  return null;
}

export function StationMarker({
  id,
  lat,
  lng,
  label,
  aqi,
  theme,
  isSelected,
  onSelect,
}: {
  id: string;
  lat: number;
  lng: number;
  label: string;
  aqi: number;
  theme: AqiThemeMode;
  isSelected: boolean;
  onSelect: (marker: google.maps.marker.AdvancedMarkerElement | null) => void;
}) {
  const [markerInstance, setMarkerInstance] =
    useState<google.maps.marker.AdvancedMarkerElement | null>(null);
  const palette = getPinPalette(theme);

  const markerRef = useCallback((el: google.maps.marker.AdvancedMarkerElement | null) => {
    setMarkerInstance(el);
  }, []);

  return (
    <AdvancedMarker
      key={id}
      ref={markerRef}
      position={{ lat, lng }}
      title={`${label} — NAQI ${aqi}`}
      onClick={() => onSelect(markerInstance)}
    >
      <div
        className={`flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-xs font-bold shadow-md transition-transform ${
          isSelected ? 'scale-110 ring-2 ring-white' : 'hover:scale-105'
        }`}
        style={{
          backgroundColor: palette.bg,
          borderColor: palette.border,
          color: palette.text,
        }}
      >
        <span className="tabular-nums">{aqi}</span>
      </div>
    </AdvancedMarker>
  );
}

export function StationListRow({
  name,
  subtitle,
  aqi,
  tier,
  theme,
  onSelect,
}: {
  name: string;
  subtitle: string;
  aqi: number;
  tier: string;
  theme: AqiThemeMode;
  onSelect: () => void;
}) {
  const tierColorClass =
    theme === 'high'
      ? 'text-red-700 dark:text-red-300'
      : theme === 'moderate'
        ? 'text-amber-700 dark:text-amber-300'
        : 'text-emerald-700 dark:text-emerald-300';

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[var(--vayu-surface)]">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-[var(--vayu-ink)]">{name}</div>
        <div className="truncate text-xs text-[var(--vayu-ink-muted)]">{subtitle}</div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <div className="text-right">
          <div className="font-mono text-base font-bold tabular-nums text-[var(--vayu-ink)]">
            {aqi}
          </div>
          <div className={`text-[11px] font-semibold ${tierColorClass}`}>{tier}</div>
        </div>

        <button
          type="button"
          onClick={onSelect}
          aria-label={`Set ${name} as active location`}
          title={`Make ${name} active location`}
          className="rounded-md border border-[var(--vayu-border)] bg-[var(--vayu-surface)] p-1.5 text-[var(--vayu-ink)] transition-colors hover:border-[var(--vayu-accent)] hover:text-[var(--vayu-accent)]"
        >
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
