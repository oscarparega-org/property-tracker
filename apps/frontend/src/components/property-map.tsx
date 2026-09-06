'use client';

import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import type { PropertyDto } from '@house-tracker/shared';

maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

type Props = {
  properties: PropertyDto[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function PropertyMap({ properties, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            maxzoom: 19,
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          }
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
      },
      center: [-99.1601, 19.3986],
      zoom: 13,
      attributionControl: { compact: true }
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    mapRef.current = map;
    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    const located = properties.filter((property) => property.latitude !== null && property.longitude !== null);
    const bounds = new maplibregl.LngLatBounds();
    for (const property of located) {
      const element = document.createElement('button');
      element.className = `map-pin${property.id === selectedId ? ' is-selected' : ''}`;
      element.type = 'button';
      element.setAttribute('aria-label', `Ver ${property.title}`);
      element.innerHTML = `<span>${property.isFavorite ? '♥' : ''}</span>`;
      element.addEventListener('click', () => onSelectRef.current(property.id));
      const coordinates: [number, number] = [property.longitude as number, property.latitude as number];
      markersRef.current.push(new maplibregl.Marker({ element, anchor: 'center' }).setLngLat(coordinates).addTo(map));
      bounds.extend(coordinates);
    }

    if (located.length === 1) {
      map.easeTo({
        center: [located[0]!.longitude as number, located[0]!.latitude as number],
        zoom: 14.5
      });
    } else if (located.length > 1) {
      map.fitBounds(bounds, { padding: 72, maxZoom: 15, duration: 500 });
    }
  }, [properties, selectedId]);

  return (
    <div className="map-shell">
      <div ref={containerRef} className="property-map" />
      <div className="map-note">
        <strong>{properties.filter((item) => item.latitude !== null).length}</strong>
        <span>en el mapa</span>
      </div>
    </div>
  );
}
