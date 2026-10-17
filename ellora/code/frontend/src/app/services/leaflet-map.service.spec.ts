import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LeafletMapService } from './leaflet-map.service';

// Leaflet's browser chunk is CommonJS and Angular exposes its API under default.
vi.mock('leaflet', () => ({ default: { map: vi.fn(), tileLayer: vi.fn(), marker: vi.fn(), divIcon: vi.fn() } }));

describe('Leaflet browser SDK loading', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('unwraps a default-only SDK and shares a single successful load between pickers', async () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(LeafletMapService);
    const first = service.load();
    expect(service.load()).toBe(first);
    const sdk = await first;
    expect(typeof sdk.map).toBe('function'); expect(typeof sdk.tileLayer).toBe('function'); expect(typeof sdk.marker).toBe('function');
    expect(await service.load()).toBe(sdk);
  });
});
