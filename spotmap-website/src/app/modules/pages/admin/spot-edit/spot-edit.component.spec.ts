import { Component, input, output, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, type Route } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import type { AdminSpot, LngLat } from '../../../../models/admin/admin-spot';
import { AdminRepository } from '../../../../services/admin/admin-repository';
import { AdminSession } from '../../../../services/admin/admin-session';
import {
  ESRI_WORLD_IMAGERY,
  IMAGERY_CONFIG,
} from '../../../../services/admin/imagery';
import {
  PhotoPipeline,
  type ProcessedPhoto,
} from '../../../../services/admin/photo-pipeline/photo-pipeline';
import {
  photoUrl,
  SPOTMAP_BACKEND,
  type SpotmapBackend,
} from '../../../../services/spotmap-backend';
import {
  PICKER_DETAIL_ZOOM,
  SatellitePickerComponent,
} from '../../../components/admin/satellite-picker/satellite-picker.component';
import { AdminShellComponent } from '../admin-shell/admin-shell.component';
import { ADMIN_ROUTES } from '../admin.routes';
import { SpotListComponent } from '../spot-list/spot-list.component';
import { buildPatch, SpotEditComponent } from './spot-edit.component';

const SPOT_ID = 'hbf-curb-99f6e5';
const A = 'vienna/hbf-curb-99f6e5-9f98eefd.webp';
const B = 'vienna/hbf-curb-99f6e5-0a1b2c3d.webp';
const C = 'vienna/hbf-curb-99f6e5-11223344.webp';
const BACKEND: SpotmapBackend = {
  apiUrl: 'https://project.test',
  publishableKey: 'sb_publishable_test',
  photoBaseUrl: 'https://project.test/storage/v1/object/public/spot-photos',
};

/** The spot under edit as `admin_get_spot` returns it; `overrides` set what a test is about. */
function spot(overrides: Partial<AdminSpot> = {}): AdminSpot {
  return {
    id: SPOT_ID,
    city: 'vienna',
    name: 'Hbf Curb',
    status: 'active',
    lng: 16.3785491,
    lat: 48.1840844,
    notes: 'Waxed curb by the station.',
    photos: [A, B, C],
    deletedAt: null,
    updatedAt: '2026-10-18T10:00:00+00:00',
    ...overrides,
  };
}

/** A pipeline result for a picked file, standing in for the real decode and encode. */
function processed(sourceName: string, hash8: string): ProcessedPhoto {
  const webp = (text: string) => new Blob([text], { type: 'image/webp' });
  return {
    sourceName,
    gps: null,
    full: webp('full'),
    thumb: webp('thumb'),
    hash8,
    width: 1400,
    height: 1050,
  };
}

/** Stands in for the satellite picker: records its inputs, and the test emits `position`. */
@Component({
  selector: 'app-satellite-picker',
  // The real frame brings its own height; a fixed one here stands in for it.
  template: '<div data-testid="fake-frame" style="height: 123px"></div>',
})
class FakeSatellitePickerComponent {
  readonly centre = input.required<LngLat>();
  readonly zoom = input<number>(PICKER_DETAIL_ZOOM);
  readonly token = input<string | null>(null);
  readonly position = output<LngLat>();
}

describe('buildPatch', () => {
  const draft = {
    name: 'Hbf Curb',
    status: 'active' as const,
    notes: 'Waxed curb by the station.',
  };
  it('is empty when nothing changed', () =>
    expect(buildPatch(spot(), draft)).toEqual({}));
  it('holds only the changed fields, the name trimmed', () =>
    expect(
      buildPatch(spot(), {
        ...draft,
        name: '  Hbf Curb East ',
        status: 'demolished',
      }),
    ).toEqual({ name: 'Hbf Curb East', status: 'demolished' }));
  it('ignores a change of surrounding spaces in the name', () =>
    expect(buildPatch(spot(), { ...draft, name: ' Hbf Curb ' })).toEqual({}));
  it('sends blank notes as null and keeps typed notes verbatim', () => {
    expect(buildPatch(spot(), { ...draft, notes: '  ' })).toEqual({
      notes: null,
    });
    expect(buildPatch(spot({ notes: null }), { ...draft, notes: '' })).toEqual(
      {},
    );
    expect(
      buildPatch(spot(), { ...draft, notes: 'Line one\nline two' }),
    ).toEqual({ notes: 'Line one\nline two' });
  });
});

describe('SpotEditComponent', () => {
  let repository: jasmine.SpyObj<AdminRepository>;
  let pipeline: jasmine.SpyObj<PhotoPipeline>;
  let harness: RouterTestingHarness;
  let el: HTMLElement;

  beforeEach(() => {
    repository = jasmine.createSpyObj<AdminRepository>('AdminRepository', [
      'getSpot',
      'updateSpot',
      'reorderPhotos',
      'removePhoto',
      'attachPhotos',
      'deleteSpot',
      'restoreSpot',
      'imageryToken',
    ]);
    repository.getSpot.and.callFake(async () => spot());
    repository.imageryToken.and.resolveTo('test-key');
    pipeline = jasmine.createSpyObj<PhotoPipeline>('PhotoPipeline', [
      'process',
    ]);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'admin/spots/:id', component: SpotEditComponent },
        ]),
        { provide: AdminRepository, useValue: repository },
        { provide: PhotoPipeline, useValue: pipeline },
        { provide: SPOTMAP_BACKEND, useValue: BACKEND },
        { provide: IMAGERY_CONFIG, useValue: ESRI_WORLD_IMAGERY },
      ],
    });
    TestBed.overrideComponent(SpotEditComponent, {
      remove: { imports: [SatellitePickerComponent] },
      add: { imports: [FakeSatellitePickerComponent] },
    });
  });

  async function settle(): Promise<void> {
    for (let i = 0; i < 2; i++) {
      await harness.fixture.whenStable();
      harness.detectChanges();
    }
  }

  async function open(): Promise<void> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/admin/spots/${SPOT_ID}`, SpotEditComponent);
    await settle();
    el = harness.routeNativeElement!;
  }

  const q = <T extends HTMLElement = HTMLElement>(
    id: string,
    root: ParentNode = el,
  ) => root.querySelector<T>(`[data-testid="${id}"]`);
  const status = () => q('edit-status')!.textContent!.trim();
  const items = () =>
    Array.from(el.querySelectorAll<HTMLElement>('[data-testid="photo-item"]'));
  const picker = () =>
    harness.fixture.debugElement.query(
      By.directive(FakeSatellitePickerComponent),
    )?.componentInstance as FakeSatellitePickerComponent | undefined;

  async function click(id: string, root: ParentNode = el): Promise<void> {
    q(id, root)!.click();
    await settle();
  }

  function type(id: string, value: string): void {
    const field = q<HTMLInputElement | HTMLTextAreaElement>(id)!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
  }

  it('loads the spot named in the route and fills the form', async () => {
    await open();
    expect(repository.getSpot).toHaveBeenCalledOnceWith(SPOT_ID);
    expect(q('edit-title')!.textContent!.trim()).toBe('Hbf Curb');
    expect(q<HTMLInputElement>('spot-name')!.value).toBe('Hbf Curb');
    expect(q<HTMLSelectElement>('spot-status')!.value).toBe('active');
    expect(q<HTMLTextAreaElement>('spot-notes')!.value).toBe(
      'Waxed curb by the station.',
    );
  });

  it('shows a load failure with a retry', async () => {
    repository.getSpot.and.rejectWith(
      new Error('admin_get_spot: no spot hbf-curb-99f6e5'),
    );
    await open();
    expect(q('edit-error')!.textContent).toContain(
      'admin_get_spot: no spot hbf-curb-99f6e5',
    );
    repository.getSpot.and.callFake(async () => spot());
    await click('edit-retry');
    expect(q('edit-title')!.textContent!.trim()).toBe('Hbf Curb');
  });

  it('offers nothing to save until a field changes', async () => {
    await open();
    expect(q('save-details')!.getAttribute('aria-disabled')).toBe('true');
    await click('save-details');
    expect(repository.updateSpot).not.toHaveBeenCalled();
  });

  it('saves only the changed fields in one update and announces it', async () => {
    let finish!: (s: AdminSpot) => void;
    repository.updateSpot.and.returnValue(
      new Promise((resolve) => (finish = resolve)),
    );
    await open();
    expect(q('edit-status')!.getAttribute('aria-live')).toBe('polite');
    type('spot-name', 'Hbf Curb East');
    const select = q<HTMLSelectElement>('spot-status')!;
    select.value = 'demolished';
    select.dispatchEvent(new Event('change'));
    await settle();
    await click('save-details');
    expect(repository.updateSpot).toHaveBeenCalledOnceWith(SPOT_ID, {
      name: 'Hbf Curb East',
      status: 'demolished',
    });
    expect(status()).toBe('Saving the details…');
    finish(spot({ name: 'Hbf Curb East', status: 'demolished' }));
    await settle();
    expect(status()).toBe('Details saved.');
  });

  it('keeps the typed values and names the failure when a save fails', async () => {
    repository.updateSpot.and.rejectWith(new Error('admin only'));
    await open();
    type('spot-name', 'Hbf Curb East');
    await settle();
    await click('save-details');
    expect(status()).toBe('Could not save the details: admin only');
    expect(q<HTMLInputElement>('spot-name')!.value).toBe('Hbf Curb East');
  });

  it('blocks a blank name and ties the message to the field', async () => {
    await open();
    type('spot-name', '   ');
    await settle();
    const name = q('spot-name')!;
    expect(q('spot-name-error')!.textContent!.trim()).toBe(
      'A spot needs a name.',
    );
    expect(name.getAttribute('aria-describedby')).toBe('spot-name-error');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    await click('save-details');
    expect(repository.updateSpot).not.toHaveBeenCalled();
  });

  it('opens the picker on the spot at detail zoom with the imagery key', async () => {
    await open();
    await click('move-pin');
    expect(repository.imageryToken).toHaveBeenCalledOnceWith('esri_api_key');
    expect(picker()!.centre()).toEqual({ lng: 16.3785491, lat: 48.1840844 });
    expect(picker()!.zoom()).toBe(PICKER_DETAIL_ZOOM);
    expect(picker()!.token()).toBe('test-key');
  });

  it('saves the picked position as one update and closes the picker', async () => {
    repository.updateSpot.and.callFake(async () =>
      spot({ lng: 16.379, lat: 48.1841 }),
    );
    await open();
    await click('move-pin');
    picker()!.position.emit({ lng: 16.3785491, lat: 48.1840844 });
    await settle();
    expect(q('save-position')!.getAttribute('aria-disabled')).toBe('true');
    picker()!.position.emit({ lng: 16.379, lat: 48.1841 });
    await settle();
    await click('save-position');
    expect(repository.updateSpot).toHaveBeenCalledOnceWith(SPOT_ID, {
      position: { lng: 16.379, lat: 48.1841 },
    });
    expect(status()).toBe('Pin moved.');
    expect(q('picker-panel')).toBeNull();
  });

  it('keeps the picker closed when no imagery key is stored', async () => {
    repository.imageryToken.and.resolveTo(null);
    await open();
    await click('move-pin');
    expect(q('picker-panel')).toBeNull();
    expect(status()).toContain('admin_settings');
  });

  it('lets the picker take its height from its frame, not from a second number', async () => {
    await open();
    await click('move-pin');
    const host = el.querySelector<HTMLElement>('app-satellite-picker')!;
    expect(host.getBoundingClientRect().height).toBe(123);
  });

  it('puts "Add photos" beside the Photos heading', async () => {
    await open();
    const heading = q('photos-title')!.getBoundingClientRect();
    const add = q('add-photos-input')!.parentElement!.getBoundingClientRect();
    expect(add.top).toBeLessThan(heading.bottom);
  });

  it('styles the status select with its own arrow', async () => {
    await open();
    const wrapper = q('spot-status')!.parentElement!;
    expect(getComputedStyle(wrapper, '::after').content).not.toBe('none');
  });

  it('draws the Deleted tag as a bordered tag', async () => {
    repository.getSpot.and.callFake(async () =>
      spot({ deletedAt: '2026-10-19T09:00:00+00:00' }),
    );
    await open();
    expect(getComputedStyle(q('deleted-label')!).borderTopWidth).toBe('1px');
  });

  it('shows each photo as its thumbnail, in order', async () => {
    await open();
    const sources = items().map((item) =>
      item.querySelector('img')!.getAttribute('src'),
    );
    expect(sources).toEqual(
      [A, B, C].map((key) => photoUrl(BACKEND.photoBaseUrl, key, 'thumb')),
    );
  });

  it('reorders with earlier / later buttons and keeps focus on the moved photo', async () => {
    repository.reorderPhotos.and.callFake(async (_id, keys) =>
      spot({ photos: [...keys] }),
    );
    await open();
    expect(
      q<HTMLButtonElement>('photo-earlier', items()[0])!.disabled,
    ).toBeTrue();
    expect(
      q<HTMLButtonElement>('photo-later', items()[2])!.disabled,
    ).toBeTrue();
    await click('photo-later', items()[0]);
    expect(repository.reorderPhotos).toHaveBeenCalledOnceWith(SPOT_ID, [
      B,
      A,
      C,
    ]);
    expect(items().map((item) => item.dataset['key'])).toEqual([B, A, C]);
    expect(document.activeElement).toBe(q('photo-later', items()[1]));
    expect(status()).toBe('Photos reordered.');
  });

  it('names each glyph button with its visible glyph first, so voice control can target it', async () => {
    await open();
    const item = items()[1];
    for (const id of ['photo-earlier', 'photo-later', 'photo-remove']) {
      const button = q(id, item)!;
      expect(button.getAttribute('aria-label')).toContain(
        button.textContent!.trim(),
      );
    }
    expect(q('photo-earlier', item)!.getAttribute('aria-label')).toBe(
      '< Move photo 2 earlier',
    );
  });

  it('snaps a just-moved photo to its dimmed state with no transition, so the fade back reads', async () => {
    await open();
    const item = items()[0];
    const idle = getComputedStyle(item);
    expect(idle.transitionProperty).toContain('opacity');
    item.classList.add('photo--settling');
    const settling = getComputedStyle(item);
    expect(settling.transitionProperty).toBe('none');
    expect(Number(settling.opacity)).toBeCloseTo(0.35, 2);
  });

  it('removes a photo only after the in-page confirmation', async () => {
    const confirmSpy = spyOn(window, 'confirm');
    repository.removePhoto.and.callFake(async () => spot({ photos: [B, C] }));
    await open();
    await click('photo-remove', items()[0]);
    expect(repository.removePhoto).not.toHaveBeenCalled();
    await click('photo-remove-cancel', items()[0]);
    expect(q('photo-remove-confirm')).toBeNull();
    await click('photo-remove', items()[0]);
    await click('photo-remove-confirm', items()[0]);
    expect(repository.removePhoto).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({ id: SPOT_ID }),
      A,
    );
    expect(items().length).toBe(2);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('adds picked photos through the pipeline in one attach', async () => {
    pipeline.process.and.callFake(async (file) =>
      processed(file.name, file.name === 'a.jpg' ? 'aaaaaaaa' : 'bbbbbbbb'),
    );
    repository.attachPhotos.and.callFake(async () =>
      spot({ photos: [A, B, C, 'vienna/hbf-curb-99f6e5-aaaaaaaa.webp'] }),
    );
    await open();
    const input = q<HTMLInputElement>('add-photos-input')!;
    const transfer = new DataTransfer();
    transfer.items.add(new File(['a'], 'a.jpg', { type: 'image/jpeg' }));
    transfer.items.add(new File(['b'], 'b.heic', { type: 'image/heic' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
    await settle();
    expect(pipeline.process.calls.allArgs().map(([file]) => file.name)).toEqual(
      ['a.jpg', 'b.heic'],
    );
    expect(repository.attachPhotos).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({ id: SPOT_ID }),
      [processed('a.jpg', 'aaaaaaaa'), processed('b.heic', 'bbbbbbbb')],
    );
    expect(status()).toBe('Photos added.');
  });

  it('names the photo that could not be prepared and attaches nothing', async () => {
    pipeline.process.and.rejectWith(
      new Error('This photo could not be decoded.'),
    );
    await open();
    const input = q<HTMLInputElement>('add-photos-input')!;
    const transfer = new DataTransfer();
    transfer.items.add(new File(['a'], 'a.jpg', { type: 'image/jpeg' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
    await settle();
    expect(status()).toBe(
      'Could not prepare a.jpg: This photo could not be decoded.',
    );
    expect(repository.attachPhotos).not.toHaveBeenCalled();
  });

  it('deletes after the in-page confirmation, then offers restore', async () => {
    const confirmSpy = spyOn(window, 'confirm');
    repository.deleteSpot.and.callFake(async () =>
      spot({ deletedAt: '2026-10-18T11:00:00+00:00' }),
    );
    repository.restoreSpot.and.callFake(async () => spot());
    await open();
    await click('delete-spot');
    await click('delete-cancel');
    expect(repository.deleteSpot).not.toHaveBeenCalled();
    await click('delete-spot');
    await click('delete-confirm');
    expect(repository.deleteSpot).toHaveBeenCalledOnceWith(SPOT_ID);
    expect(q('deleted-label')).not.toBeNull();
    await click('restore-spot');
    expect(repository.restoreSpot).toHaveBeenCalledOnceWith(SPOT_ID);
    expect(q('delete-spot')).not.toBeNull();
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});

describe('SpotEditComponent inside the admin shell', () => {
  let getSpot: jasmine.Spy<AdminRepository['getSpot']>;
  let harness: RouterTestingHarness;

  beforeEach(() => {
    getSpot = jasmine.createSpy('getSpot');
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'admin',
            component: AdminShellComponent,
            children: [{ path: 'spots/:id', component: SpotEditComponent }],
          },
        ]),
        {
          provide: AdminSession,
          useValue: {
            state: signal({
              status: 'signed-in',
              email: 'maintainer@example.org',
              isAdmin: true,
            }),
            signOut: () => Promise.resolve(),
          },
        },
        { provide: AdminRepository, useValue: { getSpot } },
        { provide: PhotoPipeline, useValue: {} },
        { provide: SPOTMAP_BACKEND, useValue: BACKEND },
        { provide: IMAGERY_CONFIG, useValue: ESRI_WORLD_IMAGERY },
      ],
    });
    TestBed.overrideComponent(SpotEditComponent, {
      remove: { imports: [SatellitePickerComponent] },
      add: { imports: [FakeSatellitePickerComponent] },
    });
  });

  /** Navigates into the edit page through the shell and lets the shell's focus move render. */
  async function openSpot(): Promise<HTMLElement> {
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/admin/spots/${SPOT_ID}`);
    await settle();
    return harness.routeNativeElement!;
  }

  async function settle(): Promise<void> {
    for (let i = 0; i < 2; i++) {
      await harness.fixture.whenStable();
      harness.detectChanges();
    }
  }

  /** The accessible name of a heading: its `aria-label` when it has one, else its text. */
  const headingName = (heading: Element | null) =>
    heading?.getAttribute('aria-label') ?? heading?.textContent?.trim();

  it('focuses a named heading while the spot is still loading', async () => {
    getSpot.and.returnValue(new Promise(() => undefined));
    await openSpot();
    const focused = document.activeElement!;
    expect(focused.tagName).toBe('H1');
    expect(headingName(focused)).toBe('Loading the spot');
  });

  it('moves focus to the spot name once the spot has loaded', async () => {
    let finish!: (loaded: AdminSpot) => void;
    getSpot.and.returnValue(new Promise((resolve) => (finish = resolve)));
    const root = await openSpot();
    finish(spot());
    await settle();
    expect(document.activeElement).toBe(
      root.querySelector('[data-testid="edit-title"]'),
    );
  });

  it('keeps focus where the maintainer put it when the spot finishes loading', async () => {
    let finish!: (loaded: AdminSpot) => void;
    getSpot.and.returnValue(new Promise((resolve) => (finish = resolve)));
    const root = await openSpot();
    const signOut = root.ownerDocument.querySelector<HTMLElement>(
      '[data-testid="sign-out-button"]',
    )!;
    signOut.focus();
    finish(spot());
    await settle();
    expect(document.activeElement).toBe(signOut);
  });

  it('gives the load-failure state a heading and focuses it', async () => {
    getSpot.and.rejectWith(new Error('admin_get_spot: no spot'));
    const root = await openSpot();
    const heading = root.querySelector('[data-testid="edit-error"] h1');
    expect(heading).not.toBeNull();
    expect(headingName(heading)).toContain('Could not load the spot');
    expect(document.activeElement).toBe(heading);
  });
});

describe('the spots routes', () => {
  /** The guarded shell route's child at `path`. */
  function child(path: string): Route | undefined {
    return ADMIN_ROUTES.find((route) => route.children)?.children?.find(
      (route) => route.path === path,
    );
  }

  it('lazy-loads the list at spots and the edit page at spots/:id', async () => {
    expect((await child('spots')?.loadComponent?.()) as unknown).toBe(
      SpotListComponent,
    );
    expect((await child('spots/:id')?.loadComponent?.()) as unknown).toBe(
      SpotEditComponent,
    );
  });
});
