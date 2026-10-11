import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { SalonDetails } from './salon-details.component';
import { SalonApiService } from '../../services/salon-api.service';
import { Salon } from '../../models/ellora.model';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('Progressive salon loading', () => {
  const api = { detail: vi.fn(), services: vi.fn(), reviews: vi.fn(), search: vi.fn(), workingHours: vi.fn() };
  let component: SalonDetails;
  beforeEach(() => {
    vi.resetAllMocks();
    api.detail.mockImplementation(async (id: string) => ({ id, name: 'Salon ' + id }));
    api.services.mockResolvedValue([]); api.reviews.mockResolvedValue({ content: [] });
    api.search.mockResolvedValue({ content: [] }); api.workingHours.mockResolvedValue([]);
    TestBed.configureTestingModule({ providers: [
      { provide: SalonApiService, useValue: api }, { provide: ActivatedRoute, useValue: {} },
    ] });
    component = TestBed.runInInjectionContext(() => new SalonDetails());
  });
  afterEach(() => { component.ngOnDestroy(); TestBed.resetTestingModule(); });
  const load = (id: string) => (component as unknown as { load(id: string): Promise<void> }).load(id);

  it('shows salon and services while reviews are still pending', async () => {
    const reviews = deferred<{ content: [] }>(); api.reviews.mockReturnValue(reviews.promise);
    api.services.mockResolvedValue([{ id: 'gel', name: 'Sơn gel' }]);
    const loading = load('1');
    await Promise.resolve(); await Promise.resolve();
    expect(component.salon()?.id).toBe('1');
    expect(component.services()[0].name).toBe('Sơn gel');
    expect(component.error()).toBe('');
    reviews.resolve({ content: [] }); await loading;
  });

  it('retains loaded content and reports a secondary request failure', async () => {
    api.reviews.mockRejectedValue(new Error('offline'));
    await load('1');
    expect(component.salon()?.id).toBe('1');
    expect(component.error()).not.toBe('');
  });

  it('ignores late responses from an older salon', async () => {
    const older = deferred<Salon>();
    api.detail.mockImplementation((id: string) => id === '1' ? older.promise : Promise.resolve({ id }));
    const first = load('1'); await load('2');
    older.resolve({ id: '1' } as Salon); await first;
    expect(component.salon()?.id).toBe('2');
  });

  it('ignores pending responses after leaving the page', async () => {
    const pending = deferred<Salon>(); api.detail.mockReturnValue(pending.promise);
    const loading = load('1'); component.ngOnDestroy();
    pending.resolve({ id: '1' } as Salon); await loading;
    expect(component.salon()).toBeNull();
  });
});
