import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SalonProfileComponent } from './salon-profile.component';
import { OwnerApiService } from '../../../services/owner-api.service';
import { SalonCoordinates } from '../../../services/leaflet-map.service';
import { SalonProfileChange, SalonProfileFields, SalonRegistration } from '../../../services/salon-registration.service';
import { SalonChangePreviewComponent } from '../../../shared/components/salon-change-preview.component';

describe('Owner salon location proposals', () => {
  const original: SalonRegistration = {
    id: 12, name: 'Ellora Nails', description: 'Tiệm nail', address: '12 Lê Lợi',
    city: 'Hồ Chí Minh', district: 'Quận 1', phone: '0901234567', email: 'salon@example.com',
    ownerName: 'Chủ tiệm', ownerId: 'owner-12', status: 'ACTIVE', latitude: 10.77, longitude: 106.7,
  };
  const api = { salon: vi.fn(), salonChange: vi.fn(), saveSalon: vi.fn() };
  let fixture: ComponentFixture<SalonProfileComponent>;
  let component: SalonProfileComponent;

  function fields(salon: SalonRegistration): SalonProfileFields {
    return {
      name: salon.name, description: salon.description, address: salon.address,
      city: salon.city, district: salon.district, phone: salon.phone, email: salon.email,
      latitude: salon.latitude, longitude: salon.longitude,
    };
  }

  function pendingChange(proposed: SalonProfileFields = fields(original)): SalonProfileChange {
    return {
      id: 5, salonId: original.id, salonName: original.name, kind: 'PROFILE', status: 'PENDING',
      current: fields(original), proposed, submittedAt: '2026-10-18T03:00:00Z', reviewedAt: null,
      currentLogoUrl: null, proposedLogoUrl: null, currentImageUrls: [], proposedImageUrls: null,
    };
  }

  async function load(salon: SalonRegistration = { ...original }, change: SalonProfileChange | null = null) {
    api.salon.mockResolvedValue(salon);
    api.salonChange.mockResolvedValue(change);
    fixture = TestBed.createComponent(SalonProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    vi.resetAllMocks();
    api.saveSalon.mockImplementation(async (request: SalonProfileFields) => pendingChange(request));
    TestBed.configureTestingModule({
      imports: [SalonProfileComponent, SalonChangePreviewComponent],
      providers: [{ provide: OwnerApiService, useValue: api }],
    });
    // The profile state is under test; hours, uploads and map loading have their own tests.
    TestBed.overrideComponent(SalonProfileComponent, { set: { template: '' } });
  });

  afterEach(() => TestBed.resetTestingModule());

  it.each([
    { latitude: null, longitude: null },
    { latitude: undefined, longitude: undefined },
    { latitude: 10.77, longitude: null },
    { latitude: Number.NaN, longitude: 106.7 },
    { latitude: 91, longitude: 106.7 },
  ])('loads an absent or invalid coordinate pair as no selection: %j', async coordinates => {
    await load({ ...original, ...coordinates });
    expect(component.location()).toBeNull();
    expect(component.locationNeedsReselect()).toBe(false);
    expect(component.form.pristine).toBe(true);
  });

  it('loads zero coordinates and keeps them when unrelated fields or unchanged address values emit', async () => {
    await load({ ...original, latitude: 0, longitude: 0 });
    expect(component.location()).toEqual({ latitude: 0, longitude: 0 });
    component.form.controls.address.setValue(original.address);
    component.form.controls.city.setValue(original.city);
    component.form.controls.district.setValue(original.district);
    component.form.controls.description.setValue('Giới thiệu mới');
    expect(component.location()).toEqual({ latitude: 0, longitude: 0 });
    expect(component.locationNeedsReselect()).toBe(false);
  });

  it('submits a coordinate-only proposal without changing the live salon and restores its old pin while pending', async () => {
    const liveSalon = { ...original };
    await load(liveSalon);
    const selected: SalonCoordinates = { latitude: 0, longitude: 107.12 };
    component.selectLocation(selected);
    expect(component.form.dirty).toBe(true);
    await component.save();
    expect(api.saveSalon).toHaveBeenCalledWith({
      name: original.name, description: original.description, address: original.address,
      city: original.city, district: original.district, phone: original.phone, email: original.email,
      ...selected,
    });
    expect(component.pending()).toBe(true);
    expect(component.form.disabled).toBe(true);
    expect(component.location()).toEqual({ latitude: original.latitude, longitude: original.longitude });
    expect(liveSalon).toEqual(original);
    expect(component.salon()).toBe(liveSalon);
    expect(component.change()?.proposed).toMatchObject(selected);
  });

  it.each(['address', 'city', 'district'] as const)('requires a fresh pin after changing %s and accepts the new selection', async field => {
    await load();
    component.form.controls[field].setValue(`${original[field]} mới`);
    expect(component.location()).toBeNull();
    expect(component.locationNeedsReselect()).toBe(true);
    await component.save();
    expect(api.saveSalon).not.toHaveBeenCalled();
    expect(component.error()).not.toBe('');
    const selected = { latitude: 10.8, longitude: 106.75 };
    component.selectLocation(selected);
    expect(component.locationNeedsReselect()).toBe(false);
    await component.save();
    expect(api.saveSalon).toHaveBeenCalledWith(expect.objectContaining({ [field]: `${original[field]} mới`, ...selected }));
  });

  it('allows a legacy salon without a pin to edit its address without sending coordinates', async () => {
    await load({ ...original, latitude: null, longitude: null });
    component.form.controls.address.setValue('34 Nguyễn Huệ');
    expect(component.locationNeedsReselect()).toBe(false);
    await component.save();
    expect(api.saveSalon).toHaveBeenCalledOnce();
    const request = api.saveSalon.mock.calls[0][0];
    expect(request.address).toBe('34 Nguyễn Huệ');
    expect(request).not.toHaveProperty('latitude');
    expect(request).not.toHaveProperty('longitude');
  });

  it('resets edited coordinates and ignores map selections while saving or waiting for approval', async () => {
    await load();
    component.form.controls.address.setValue('Địa chỉ mới');
    component.selectLocation({ latitude: 11, longitude: 107 });
    component.reset();
    expect(component.form.controls.address.value).toBe(original.address);
    expect(component.form.pristine).toBe(true);
    expect(component.location()).toEqual({ latitude: original.latitude, longitude: original.longitude });
    expect(component.locationNeedsReselect()).toBe(false);
    component.saving.set(true);
    component.selectLocation({ latitude: 12, longitude: 108 });
    expect(component.location()).toEqual({ latitude: original.latitude, longitude: original.longitude });
    component.saving.set(false);
    api.salonChange.mockResolvedValue(pendingChange());
    await component.load();
    component.selectLocation({ latitude: 13, longitude: 109 });
    await component.save();
    expect(component.form.disabled).toBe(true);
    expect(component.location()).toEqual({ latitude: original.latitude, longitude: original.longitude });
    expect(api.saveSalon).not.toHaveBeenCalled();
  });

  it('retains the selected pin and form edits after a failed proposal so they can be retried', async () => {
    await load();
    component.form.controls.address.setValue('Địa chỉ mới');
    const selected = { latitude: 11.15, longitude: 107.2 };
    component.selectLocation(selected);
    api.saveSalon.mockRejectedValueOnce(new HttpErrorResponse({ status: 0 }));
    await component.save();
    expect(component.location()).toEqual(selected);
    expect(component.locationNeedsReselect()).toBe(false);
    expect(component.form.controls.address.value).toBe('Địa chỉ mới');
    expect(component.form.dirty).toBe(true);
    expect(component.form.enabled).toBe(true);
    expect(component.saving()).toBe(false);
    expect(component.error()).not.toBe('');
    expect(component.salon()).toMatchObject({ latitude: original.latitude, longitude: original.longitude });
    await component.save();
    expect(api.saveSalon).toHaveBeenCalledTimes(2);
    expect(api.saveSalon.mock.calls[1][0]).toMatchObject(selected);
    expect(component.pending()).toBe(true);
  });

  it('renders both coordinate labels and actual zero values in the admin comparison preview', () => {
    const preview = TestBed.createComponent(SalonChangePreviewComponent);
    const change = pendingChange();
    change.current = { ...change.current, latitude: 0, longitude: 0 };
    preview.componentRef.setInput('change', change);
    preview.detectChanges();
    const rows = Array.from((preview.nativeElement as HTMLElement).querySelectorAll('tbody tr'));
    for (const [label, proposed] of [['Vĩ độ', original.latitude], ['Kinh độ', original.longitude]] as const) {
      const row = rows.find(item => item.querySelector('th')?.textContent?.trim() === label);
      expect(row, `missing ${label} row`).toBeDefined();
      expect(Array.from(row!.querySelectorAll('td'), cell => cell.textContent?.trim())).toEqual(['0', String(proposed)]);
      expect(row!.classList.contains('changed')).toBe(true);
    }
  });

  it.each(['omitted', 'null'] as const)('shows preserved coordinates for a legacy proposal with an %s pair', missing => {
    const preview = TestBed.createComponent(SalonChangePreviewComponent);
    const change = pendingChange();
    change.current = { ...change.current, latitude: 0, longitude: 106.7 };
    if (missing === 'omitted') {
      delete change.proposed.latitude;
      delete change.proposed.longitude;
    } else {
      change.proposed = { ...change.proposed, latitude: null, longitude: null };
    }
    preview.componentRef.setInput('change', change);
    preview.detectChanges();
    const rows = Array.from((preview.nativeElement as HTMLElement).querySelectorAll('tbody tr'));
    for (const [label, value] of [['Vĩ độ', '0'], ['Kinh độ', '106.7']]) {
      const row = rows.find(item => item.querySelector('th')?.textContent?.trim() === label);
      expect(row, `missing ${label} row`).toBeDefined();
      expect(Array.from(row!.querySelectorAll('td'), cell => cell.textContent?.trim())).toEqual([value, value]);
      expect(row!.classList.contains('changed')).toBe(false);
    }
  });
});
