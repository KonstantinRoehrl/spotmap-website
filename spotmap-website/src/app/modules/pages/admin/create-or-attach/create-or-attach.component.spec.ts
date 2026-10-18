import { Component, input, output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type {
  AdminSpot,
  LngLat,
  NearbySpot,
} from '../../../../models/admin/admin-spot';
import {
  AdminRepository,
  AdminRepositoryError,
} from '../../../../services/admin/admin-repository';
import {
  IMAGERY_CONFIG,
  type ImageryConfig,
} from '../../../../services/admin/imagery';
import {
  PhotoPipeline,
  type ProcessedPhoto,
} from '../../../../services/admin/photo-pipeline/photo-pipeline';
import { SPOTMAP_BACKEND } from '../../../../services/spotmap-backend';
import {
  PICKER_CITY_ZOOM,
  PICKER_DETAIL_ZOOM,
  SatellitePickerComponent,
} from '../../../components/admin/satellite-picker/satellite-picker.component';
import { ADMIN_ROUTES } from '../admin.routes';
import { CreateOrAttachComponent } from './create-or-attach.component';

/** Stands in for the picker, so no map is built; a spec emits its position by hand. */
@Component({ selector: 'app-satellite-picker', template: '' })
class FakePickerComponent {
  readonly centre = input.required<LngLat>();
  readonly zoom = input<number>(PICKER_DETAIL_ZOOM);
  readonly token = input<string | null>(null);
  readonly position = output<LngLat>();
}

const CONFIG: ImageryConfig = {
  tileUrlTemplate: 'https://tiles.test/{z}/{y}/{x}',
  tileSize: 512,
  maxZoom: 19,
  attribution: 'Test imagery',
  tokenSetting: 'esri_api_key',
};
const PHOTO_BASE = 'https://api.test/storage/v1/object/public/spot-photos';
const GUESS: LngLat = { lng: 16.3785491, lat: 48.1840844 };
/** About 111 m north of GUESS: far enough apart to warn. */
const FAR: LngLat = { lng: 16.3785491, lat: 48.1850844 };
const PICKED: LngLat = { lng: 16.37861, lat: 48.18412 };
const CENTRE: LngLat = { lng: 16.37, lat: 48.2 };

function processed(name: string, gps: LngLat | null): ProcessedPhoto {
  return {
    sourceName: name,
    gps,
    full: new Blob(['full'], { type: 'image/webp' }),
    thumb: new Blob(['thumb'], { type: 'image/webp' }),
    hash8: '0badc0de',
    width: 1400,
    height: 1050,
  };
}

function adminSpot(overrides: Partial<AdminSpot> = {}): AdminSpot {
  return {
    id: 'hbf-curb-99f6e5',
    city: 'vienna',
    name: 'Hbf Curb',
    status: 'active',
    lng: GUESS.lng,
    lat: GUESS.lat,
    notes: null,
    photos: ['vienna/hbf-curb-99f6e5-0badc0de.webp'],
    deletedAt: null,
    updatedAt: '2026-10-18T10:00:00Z',
    ...overrides,
  };
}

function nearby(overrides: Partial<NearbySpot> = {}): NearbySpot {
  return {
    id: 'hbf-curb-99f6e5',
    city: 'vienna',
    name: 'Hbf Curb',
    status: 'active',
    lng: GUESS.lng,
    lat: GUESS.lat,
    distanceM: 3.456,
    photoCount: 2,
    deleted: false,
    match: 'position',
    ...overrides,
  };
}

describe('CreateOrAttachComponent', () => {
  let fixture: ComponentFixture<CreateOrAttachComponent>;
  let el: HTMLElement;
  /** The GPS each picked file name's photo carries; a missing name has none. */
  let gpsByName: Record<string, LngLat>;
  let pipeline: { process: jasmine.Spy };
  let repo: jasmine.SpyObj<AdminRepository>;

  const byTestId = (id: string) =>
    el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const picker = () =>
    fixture.debugElement.query(By.directive(FakePickerComponent))
      ?.componentInstance as FakePickerComponent | undefined;

  async function settle() {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Picks files by name through the photo input. */
  async function pick(...names: string[]) {
    const transfer = new DataTransfer();
    for (const name of names) {
      transfer.items.add(new File(['x'], name, { type: 'image/jpeg' }));
    }
    const input = byTestId('photo-input') as HTMLInputElement;
    input.files = transfer.files;
    input.dispatchEvent(new Event('change'));
    await settle();
  }

  function type(id: string, value: string) {
    const field = byTestId(id) as HTMLInputElement;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function chooseCity(value: string) {
    const select = byTestId('city-select') as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event('change'));
  }

  /** Fills the place step and saves: city, name, the picker's position. */
  async function placeAndSave() {
    chooseCity('vienna');
    await settle();
    type('spot-name', '  Hbf Curb ');
    picker()!.position.emit(PICKED);
    fixture.detectChanges();
    byTestId('save')!.click();
    await settle();
  }

  beforeEach(async () => {
    gpsByName = { 'gps.jpg': GUESS, 'far.jpg': FAR };
    pipeline = {
      process: jasmine
        .createSpy('process')
        .and.callFake((file: File) =>
          Promise.resolve(processed(file.name, gpsByName[file.name] ?? null)),
        ),
    };
    repo = jasmine.createSpyObj<AdminRepository>('AdminRepository', [
      'listCities',
      'imageryToken',
      'cityCentre',
      'nearbySpots',
      'createCity',
      'createSpotWithPhotos',
      'attachPhotos',
      'getSpot',
      'restoreSpot',
    ]);
    repo.listCities.and.resolveTo(['barcelona', 'vienna']);
    repo.imageryToken.and.resolveTo('key-1');
    repo.cityCentre.and.resolveTo(CENTRE);
    repo.nearbySpots.and.resolveTo([]);
    repo.createSpotWithPhotos.and.resolveTo(adminSpot());
    repo.getSpot.and.resolveTo(adminSpot());
    repo.attachPhotos.and.resolveTo(adminSpot());
    repo.restoreSpot.and.resolveTo(adminSpot({ deletedAt: null }));
    await TestBed.configureTestingModule({
      imports: [CreateOrAttachComponent],
      providers: [
        { provide: PhotoPipeline, useValue: pipeline },
        { provide: AdminRepository, useValue: repo },
        { provide: IMAGERY_CONFIG, useValue: CONFIG },
        {
          provide: SPOTMAP_BACKEND,
          useValue: {
            apiUrl: 'https://api.test',
            publishableKey: 'sb_publishable_test',
            photoBaseUrl: PHOTO_BASE,
          }, // gitleaks:allow
        },
      ],
    })
      .overrideComponent(CreateOrAttachComponent, {
        remove: { imports: [SatellitePickerComponent] },
        add: { imports: [FakePickerComponent] },
      })
      .compileComponents();
    fixture = TestBed.createComponent(CreateOrAttachComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
    await settle();
  });

  it("is the admin shell's default child at /admin/add", async () => {
    const shell = ADMIN_ROUTES.find((route) => route.children !== undefined)!;
    expect(shell.children![0]).toEqual({
      path: '',
      pathMatch: 'full',
      redirectTo: 'add',
    });
    expect(shell.children![1].path).toBe('add');
    expect(await shell.children![1].loadComponent!()).toBe(
      CreateOrAttachComponent,
    );
  });

  it('picks any image, several at once, with a camera shortcut', () => {
    const input = byTestId('photo-input') as HTMLInputElement;
    expect(input.accept).toBe('image/*');
    expect(input.multiple).toBeTrue();
    expect(byTestId('camera-input')!.getAttribute('capture')).toBe(
      'environment',
    );
  });

  it('opens the picker close up on the first GPS guess, with the imagery key', async () => {
    await pick('plain.jpg', 'gps.jpg');
    expect(byTestId('step-place')).not.toBeNull();
    expect(picker()!.centre()).toEqual(GUESS);
    expect(picker()!.zoom()).toBe(PICKER_DETAIL_ZOOM);
    expect(picker()!.token()).toBe('key-1');
    expect(repo.imageryToken).toHaveBeenCalledOnceWith('esri_api_key');
    expect(repo.cityCentre).not.toHaveBeenCalled();
  });

  it('asks for the city first when no photo has GPS, then opens on its centre', async () => {
    await pick('plain.jpg');
    expect(picker()).toBeUndefined();
    expect(byTestId('needs-city')).not.toBeNull();
    chooseCity('vienna');
    await settle();
    expect(repo.cityCentre).toHaveBeenCalledOnceWith('vienna');
    expect(picker()!.centre()).toEqual(CENTRE);
    expect(picker()!.zoom()).toBe(PICKER_CITY_ZOOM);
  });

  it("moves focus to the new step's heading", async () => {
    await pick('gps.jpg');
    await settle();
    expect(document.activeElement).toBe(byTestId('step-heading'));
    expect(byTestId('step-heading')!.textContent).toContain('Place the spot');
  });

  it('shows a failed photo with its error, and dropping it moves on', async () => {
    pipeline.process.and.callFake((file: File) =>
      file.name === 'bad.heic'
        ? Promise.reject(new Error('This HEIC photo could not be decoded.'))
        : Promise.resolve(processed(file.name, GUESS)),
    );
    await pick('gps.jpg', 'bad.heic');
    expect(byTestId('step-processing')).not.toBeNull();
    expect(byTestId('batch-item-1')!.textContent).toContain(
      'could not be decoded',
    );
    byTestId('photo-drop')!.click();
    await settle();
    expect(byTestId('step-place')).not.toBeNull();
  });

  it('warns about a spread batch and drops a photo from it', async () => {
    await pick('gps.jpg', 'far.jpg');
    expect(byTestId('spread-warning')!.textContent).toContain('111 m apart');
    el.querySelectorAll<HTMLElement>('[data-testid="spread-drop"]')[1].click();
    await settle();
    expect(byTestId('spread-warning')).toBeNull();
  });

  it('creates the spot directly when nothing is nearby', async () => {
    await pick('gps.jpg');
    await placeAndSave();
    expect(repo.nearbySpots).toHaveBeenCalledOnceWith(PICKED, 'Hbf Curb');
    expect(repo.createSpotWithPhotos).toHaveBeenCalledOnceWith(
      {
        city: 'vienna',
        name: 'Hbf Curb',
        status: 'active',
        notes: null,
        position: PICKED,
      },
      [jasmine.objectContaining({ sourceName: 'gps.jpg' })],
    );
    expect(byTestId('step-done')!.textContent).toContain('Hbf Curb');
    expect(el.querySelector('.thumbs img')!.getAttribute('src')).toBe(
      `${PHOTO_BASE}/thumb/vienna/hbf-curb-99f6e5-0badc0de.webp`,
    );
  });

  it('lists a nearby candidate and attaches the photos to it', async () => {
    repo.nearbySpots.and.resolveTo([nearby()]);
    await pick('gps.jpg');
    await placeAndSave();
    const candidate = byTestId('candidate-hbf-curb-99f6e5')!;
    expect(candidate.textContent).toContain('3.5 m');
    expect(candidate.textContent).toContain('2 photos');
    expect(candidate.textContent).toContain('within 25 m');
    byTestId('attach')!.click();
    await settle();
    expect(repo.getSpot).toHaveBeenCalledOnceWith('hbf-curb-99f6e5');
    expect(repo.attachPhotos).toHaveBeenCalledOnceWith(adminSpot(), [
      jasmine.any(Object),
    ]);
    expect(repo.createSpotWithPhotos).not.toHaveBeenCalled();
    expect(byTestId('step-done')).not.toBeNull();
  });

  it('restores a deleted candidate before attaching', async () => {
    repo.nearbySpots.and.resolveTo([nearby({ deleted: true, match: 'name' })]);
    await pick('gps.jpg');
    await placeAndSave();
    expect(byTestId('candidate-deleted')).not.toBeNull();
    expect(byTestId('attach')).toBeNull();
    byTestId('restore-attach')!.click();
    await settle();
    expect(repo.restoreSpot).toHaveBeenCalledOnceWith('hbf-curb-99f6e5');
    expect(repo.attachPhotos).toHaveBeenCalledOnceWith(
      adminSpot({ deletedAt: null }),
      [jasmine.any(Object)],
    );
  });

  it('creates a new spot anyway when asked', async () => {
    repo.nearbySpots.and.resolveTo([nearby()]);
    await pick('gps.jpg');
    await placeAndSave();
    byTestId('create-anyway')!.click();
    await settle();
    expect(repo.createSpotWithPhotos).toHaveBeenCalledTimes(1);
    expect(repo.attachPhotos).not.toHaveBeenCalled();
  });

  it('shows a failed save and retries it with everything kept', async () => {
    repo.createSpotWithPhotos.and.returnValues(
      Promise.reject(
        new AdminRepositoryError(
          'network',
          'The upload did not reach Supabase.',
        ),
      ),
      Promise.resolve(adminSpot()),
    );
    await pick('gps.jpg');
    await placeAndSave();
    expect(byTestId('failure')!.textContent).toContain(
      'did not reach Supabase',
    );
    byTestId('failure-retry')!.click();
    await settle();
    expect(repo.createSpotWithPhotos).toHaveBeenCalledTimes(2);
    expect(repo.createSpotWithPhotos.calls.argsFor(1)).toEqual(
      repo.createSpotWithPhotos.calls.argsFor(0),
    );
    expect(byTestId('step-done')).not.toBeNull();
  });

  it('starts over for another spot, keeping the city', async () => {
    await pick('gps.jpg');
    await placeAndSave();
    byTestId('add-another')!.click();
    await settle();
    expect(byTestId('step-pick')).not.toBeNull();
    await pick('gps.jpg');
    expect((byTestId('city-select') as HTMLSelectElement).value).toBe('vienna');
    expect((byTestId('spot-name') as HTMLInputElement).value).toBe('');
  });
});
