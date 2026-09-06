import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PropertyLocationMap } from './property-location-map';

const mapMocks = vi.hoisted(() => ({
  easeTo: vi.fn(),
  mapRemove: vi.fn(),
  markerRemove: vi.fn()
}));

vi.mock('maplibre-gl', () => {
  class Map {
    easeTo = mapMocks.easeTo;
    addControl = vi.fn();
    remove = mapMocks.mapRemove;
  }

  class Marker {
    setLngLat() {
      return this;
    }

    addTo() {
      return this;
    }

    remove = mapMocks.markerRemove;
  }

  return { Map, Marker, NavigationControl: class {}, setWorkerUrl: vi.fn() };
});

describe('PropertyLocationMap', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('recenters without changing zoom and tears the map down cleanly', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { unmount } = render(
      <PropertyLocationMap latitude={19.395809} longitude={-99.173553} title="Departamento en Nápoles" />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Centrar la propiedad' }));

    expect(mapMocks.easeTo).toHaveBeenCalledWith({
      center: [-99.173553, 19.395809],
      duration: 450
    });
    expect(mapMocks.easeTo.mock.calls[0]![0]).not.toHaveProperty('zoom');

    unmount();
    expect(mapMocks.markerRemove).toHaveBeenCalledOnce();
    expect(mapMocks.mapRemove).toHaveBeenCalledOnce();
    expect(consoleError.mock.calls.flat().join(' ')).not.toContain('Attempted to synchronously unmount');
  });
});
