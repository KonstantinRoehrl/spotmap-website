import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AdminSpot } from '../../../../models/admin/admin-spot';
import { AdminRepository } from '../../../../services/admin/admin-repository';
import { SpotListComponent } from './spot-list.component';

/** A spot as `admin_list_spots` returns it; `overrides` set what a test is about. */
function spot(overrides: Partial<AdminSpot>): AdminSpot {
  return {
    id: 'hbf-curb-99f6e5',
    city: 'vienna',
    name: 'Hbf Curb',
    status: 'active',
    lng: 16.3785491,
    lat: 48.1840844,
    notes: null,
    photos: [],
    deletedAt: null,
    updatedAt: '2026-10-18T10:00:00+00:00',
    ...overrides,
  };
}

const SPOTS: AdminSpot[] = [
  spot({
    photos: [
      'vienna/hbf-curb-99f6e5-9f98eefd.webp',
      'vienna/hbf-curb-99f6e5-0a1b2c3d.webp',
    ],
  }),
  spot({ id: 'grand-ledge-0a0a0a', name: 'Grand Ledge', status: 'demolished' }),
  spot({
    id: 'gone-bank-1b1b1b',
    name: 'Gone Bank',
    deletedAt: '2026-10-17T09:00:00+00:00',
  }),
  spot({ id: 'murinsel-rail-2c2c2c', city: 'graz', name: 'Murinsel Rail' }),
];

describe('SpotListComponent', () => {
  let repository: jasmine.SpyObj<AdminRepository>;
  let fixture: ComponentFixture<SpotListComponent>;
  let el: HTMLElement;

  beforeEach(() => {
    repository = jasmine.createSpyObj<AdminRepository>('AdminRepository', [
      'listCities',
      'listSpots',
    ]);
    repository.listCities.and.resolveTo(['graz', 'vienna']);
    repository.listSpots.and.callFake(async (city) =>
      SPOTS.filter((s) => city === null || s.city === city),
    );
    TestBed.configureTestingModule({
      imports: [SpotListComponent],
      providers: [
        provideRouter([]),
        { provide: AdminRepository, useValue: repository },
      ],
    });
  });

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(SpotListComponent);
    el = fixture.nativeElement;
    fixture.detectChanges();
    await settle();
  }

  const q = <T extends HTMLElement>(id: string) =>
    el.querySelector<T>(`[data-testid="${id}"]`);
  const rows = () =>
    Array.from(el.querySelectorAll<HTMLElement>('[data-testid="spot-row"]'));
  const names = () =>
    rows().map((row) =>
      row.querySelector('[data-testid="row-name"]')!.textContent!.trim(),
    );

  async function chooseCity(slug: string): Promise<void> {
    const select = q<HTMLSelectElement>('city-filter')!;
    select.value = slug;
    select.dispatchEvent(new Event('change'));
    await settle();
  }

  it('offers "All cities" and every city the database has', async () => {
    await render();
    const options = Array.from(
      q<HTMLSelectElement>('city-filter')!.options,
    ).map((o) => o.textContent!.trim());
    expect(options).toEqual(['All cities', 'graz', 'vienna']);
  });

  it('lists every live spot of every city, each row linking to its edit page', async () => {
    await render();
    expect(repository.listSpots).toHaveBeenCalledOnceWith(null);
    expect(names()).toEqual(['Hbf Curb', 'Grand Ledge', 'Murinsel Rail']);
    const first = rows()[0];
    expect(first.querySelector('a')!.getAttribute('href')).toBe(
      '/admin/spots/hbf-curb-99f6e5',
    );
    const meta = first.querySelector('[data-testid="row-meta"]')!.textContent!;
    expect(meta).toContain('vienna');
    expect(meta).toContain('active');
    expect(meta).toContain('2 photos');
    expect(
      rows()[1].querySelector('[data-testid="row-meta"]')!.textContent,
    ).toContain('demolished');
  });

  it('shows deleted spots, labelled, only with "include deleted" on', async () => {
    await render();
    expect(names()).not.toContain('Gone Bank');
    q<HTMLInputElement>('include-deleted')!.click();
    await settle();
    const gone = rows().find((row) => row.textContent!.includes('Gone Bank'))!;
    expect(
      gone.querySelector('[data-testid="row-deleted"]')!.textContent!.trim(),
    ).toBe('Deleted');
    expect(rows()[0].querySelector('[data-testid="row-deleted"]')).toBeNull();
  });

  it('filters by name, trimmed and case-insensitive', async () => {
    await render();
    const input = q<HTMLInputElement>('name-filter')!;
    input.value = '  LEDGE ';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(names()).toEqual(['Grand Ledge']);
  });

  it('asks the database for one city once it is chosen', async () => {
    await render();
    await chooseCity('vienna');
    expect(repository.listSpots).toHaveBeenCalledWith('vienna');
    expect(names()).toEqual(['Hbf Curb', 'Grand Ledge']);
  });

  it('ignores an older answer that arrives after a newer one', async () => {
    let releaseAll!: (spots: AdminSpot[]) => void;
    repository.listSpots.and.callFake((city) =>
      city === null
        ? new Promise<AdminSpot[]>((resolve) => (releaseAll = resolve))
        : Promise.resolve(SPOTS.filter((s) => s.city === city)),
    );
    await render();
    await chooseCity('graz');
    releaseAll(SPOTS);
    await settle();
    expect(names()).toEqual(['Murinsel Rail']);
  });

  it('says so when no spot matches the filters', async () => {
    await render();
    const input = q<HTMLInputElement>('name-filter')!;
    input.value = 'zzz';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(rows().length).toBe(0);
    expect(q('list-empty')).not.toBeNull();
  });

  it('shows the loading line and announces it while the spots load', async () => {
    repository.listSpots.and.returnValue(new Promise(() => {}));
    await render();
    expect(q('list-loading')).not.toBeNull();
    expect(q('list-status')!.getAttribute('aria-live')).toBe('polite');
    expect(q('list-status')!.textContent!.trim()).toBe('Loading spots…');
  });

  it('shows a failure with a retry that loads again', async () => {
    repository.listSpots.and.rejectWith(new Error('network down'));
    await render();
    expect(q('list-error')!.textContent).toContain('network down');
    expect(q('list-status')!.textContent).toContain(
      'Could not load the spots: network down',
    );
    repository.listSpots.and.callFake(async () => SPOTS);
    q<HTMLButtonElement>('list-retry')!.click();
    await settle();
    expect(rows().length).toBe(3);
  });

  it('counts the rows shown against the spots listed, deleted ones only when included', async () => {
    await render();
    expect(q('list-status')!.textContent!.trim()).toBe('3 of 3 spots');
    const input = q<HTMLInputElement>('name-filter')!;
    input.value = 'ledge';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(q('list-status')!.textContent!.trim()).toBe('1 of 3 spots');
    q<HTMLInputElement>('include-deleted')!.click();
    await settle();
    expect(q('list-status')!.textContent!.trim()).toBe('1 of 4 spots');
  });

  it('ties a city-list failure to the city filter', async () => {
    repository.listCities.and.rejectWith(new Error('admin only'));
    await render();
    const error = q('cities-error')!;
    expect(error.textContent).toContain(
      'Could not load the cities: admin only',
    );
    expect(q('city-filter')!.getAttribute('aria-describedby')).toBe(error.id);
  });
});
