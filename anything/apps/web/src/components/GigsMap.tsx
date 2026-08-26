'use client';

import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ApiGig } from '@/lib/gigs';

/**
 * S10 map view (wireframe p2) — MapLibre + OSM raster tiles, keyless by
 * design. Pins are PUBLISHED gigs whose coordinates the server-side
 * geocoder produced (never client input). Clicking a pin's popup deep-links
 * to /gigs/[id]. The tile origin is pinned in the CSP (security-headers.js).
 *
 * S20 reuses the same component beyond browse: the gig-detail Location card
 * and the create-gig step-2 preview render a single pin via `className`
 * (container sizing), `showSummary={false}` (no pin-count chip), `maxZoom`
 * (closer framing for one pin), and `interactive={false}` (no popups —
 * a gig's own page linking to itself is noise).
 */

/** NYC — the marketplace's home turf — when no pins can frame the view. */
const DEFAULT_CENTER: [number, number] = [-73.9857, 40.7484];

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface GigsMapProps {
  gigs: ApiGig[];
  /** Container classes; the browse default keeps the pre-S20 sizing. */
  className?: string;
  /** Hide the pin-count chip (nonsense on a single-gig view). */
  showSummary?: boolean;
  /** How close to frame the pins (fitBounds maxZoom). */
  maxZoom?: number;
  /** Suppress pin popups (a gig page linking to itself is noise). */
  interactive?: boolean;
}

export default function GigsMap({
  gigs,
  className = 'h-full min-h-[500px]',
  showSummary = true,
  maxZoom = 14,
  interactive = true,
}: GigsMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: DEFAULT_CENTER,
      zoom: 11,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    for (const marker of markersRef.current) marker.remove();
    markersRef.current = [];

    const pinned = gigs.filter(
      (gig) =>
        typeof gig.lat === 'number' &&
        typeof gig.lng === 'number' &&
        Number.isFinite(gig.lat) &&
        Number.isFinite(gig.lng)
    );

    const bounds = new maplibregl.LngLatBounds();
    for (const gig of pinned) {
      const lngLat: [number, number] = [gig.lng as number, gig.lat as number];
      bounds.extend(lngLat);

      const element = document.createElement('div');
      element.style.cssText =
        'width:14px;height:14px;border-radius:9999px;background:#00FFCC;' +
        'border:2px solid #121212;box-shadow:0 0 0 2px rgba(0,255,204,.35);cursor:pointer;';

      const marker = new maplibregl.Marker({ element }).setLngLat(lngLat);
      if (interactive) {
        // Popup content is escaped — gig titles are user content (XSS-inert).
        const rate = Number(gig.base_rate);
        const popupHtml =
          `<div style="font-family:inherit">` +
          `<p style="font-weight:800;margin:0 0 2px">${escapeHtml(gig.title)}</p>` +
          `<p style="margin:0 0 6px;opacity:.6;font-size:12px">${escapeHtml(
            [gig.venue_name, gig.venue_neighborhood].filter(Boolean).join(' · ')
          )}${Number.isFinite(rate) && rate > 0 ? ` · $${rate}/hr` : ''}</p>` +
          `<a href="/gigs/${encodeURIComponent(String(gig.id))}" ` +
          `style="color:#00937a;font-weight:700;font-size:12px">View &amp; apply →</a></div>`;
        marker.setPopup(
          new maplibregl.Popup({ offset: 12, closeButton: false }).setHTML(popupHtml)
        );
      }
      marker.addTo(map);
      markersRef.current.push(marker);
    }

    if (pinned.length > 0 && !bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 64, maxZoom, duration: 400 });
    }
  }, [gigs, maxZoom, interactive]);

  const pinCount = gigs.filter((gig) => gig.lat != null && gig.lng != null).length;

  return (
    <div className={`relative rounded-2xl overflow-hidden border border-white/10 ${className}`}>
      <div ref={containerRef} className="absolute inset-0" />
      {showSummary && (
        <div className="absolute top-3 left-3 z-10 bg-[#121212]/85 backdrop-blur-sm border border-white/10 rounded-xl px-3 py-1.5">
          <p className="text-xs font-bold text-white">
            {pinCount} gig{pinCount === 1 ? '' : 's'} on the map
          </p>
          {pinCount < gigs.length && (
            <p className="text-[10px] text-white/40">
              {gigs.length - pinCount} more without a location yet
            </p>
          )}
        </div>
      )}
    </div>
  );
}
