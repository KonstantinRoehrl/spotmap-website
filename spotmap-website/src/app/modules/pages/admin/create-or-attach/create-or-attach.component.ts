import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type {
  AdminSpot,
  LngLat,
  NearbySpot,
} from '../../../../models/admin/admin-spot';
import type { SpotStatus } from '../../../../models/spots/spot';
import {
  AdminRepository,
  AdminRepositoryError,
} from '../../../../services/admin/admin-repository';
import { IMAGERY_CONFIG } from '../../../../services/admin/imagery';
import {
  PhotoPipeline,
  type ProcessedPhoto,
} from '../../../../services/admin/photo-pipeline/photo-pipeline';
import { SpotPhotos } from '../../../../services/spot-photos.service';
import {
  PICKER_CITY_ZOOM,
  PICKER_DETAIL_ZOOM,
  SatellitePickerComponent,
} from '../../../components/admin/satellite-picker/satellite-picker.component';
import { PointerBloomDirective } from '../../../directives/pointer-bloom.directive';
import {
  BATCH_SPREAD_WARN_M,
  batchSpreadM,
  type CreateOrAttachStep,
  firstGuess,
} from './create-or-attach.state';

/** The city select's value for "New city…", which no slug can equal (slugs have no `_`). */
export const NEW_CITY = '__new__';

/** The slug shape `admin_create_city` accepts, checked here so the field can say so first. */
const CITY_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Where the picker opens, and how close. */
interface PickerView {
  centre: LngLat;
  zoom: number;
}

/**
 * Where the picker opens when the batch has no GPS and the database has no live spot to centre
 * on: central Europe, where every supported city lies, at a zoom that shows the continent.
 */
const FALLBACK_VIEW: PickerView = {
  centre: { lng: 15, lat: 48 },
  zoom: 4,
};

/** One picked file on its way through the photo pipeline. */
interface BatchItem {
  /** Stable within this page, for `@for` tracking and drop/retry. */
  readonly id: number;
  readonly file: File;
  readonly state: 'processing' | 'done' | 'failed';
  readonly photo: ProcessedPhoto | null;
  readonly error: string | null;
  /** An object URL of the processed thumbnail; revoked when the item leaves the batch. */
  readonly thumbUrl: string | null;
}

/** A failed request the maintainer can retry without re-entering anything. */
interface Failure {
  readonly message: string;
  readonly retry: () => void;
}

/** The imagery key's request: in flight, answered (null = no key stored), or failed. */
type TokenState =
  | { status: 'loading' }
  | { status: 'ready'; token: string | null }
  | { status: 'failed'; message: string };

/** What a failure says: the error's own message, which every typed error in the admin carries. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Create-or-attach: the maintainer picks photos, places the spot on the satellite picker, and the
 * photos land on an existing spot within 25 m (restoring it when soft-deleted) or on a new one.
 * Every request failure is shown with a retry and keeps everything entered; every step change
 * fades and moves focus to the new step's heading, and blocks that appear or go inside a step
 * (errors, warnings, the map) fade and ease their height the same way.
 */
@Component({
  selector: 'app-create-or-attach',
  imports: [NgTemplateOutlet, SatellitePickerComponent, PointerBloomDirective],
  templateUrl: './create-or-attach.component.html',
  styleUrls: [
    '../../terminal-window.css',
    '../admin-shared.css',
    './create-or-attach.component.css',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateOrAttachComponent {
  private readonly pipeline = inject(PhotoPipeline);
  private readonly repository = inject(AdminRepository);
  private readonly imagery = inject(IMAGERY_CONFIG);
  private readonly spotPhotos = inject(SpotPhotos);
  private readonly injector = inject(Injector);
  private readonly stepHeading =
    viewChild<ElementRef<HTMLElement>>('stepHeading');
  private nextItemId = 0;

  /** The city select's "New city…" value, for the template. */
  protected readonly NEW_CITY = NEW_CITY;
  /** The batch spread that triggers the warning, for the template. */
  protected readonly BATCH_SPREAD_WARN_M = BATCH_SPREAD_WARN_M;

  /** The step on screen. */
  protected readonly step = signal<CreateOrAttachStep>('pick');
  /** The batch, in selection order — position 0 is the first photo. */
  protected readonly items = signal<readonly BatchItem[]>([]);
  /** The batch's processed photos, in order. */
  protected readonly photos = computed(() =>
    this.items().flatMap((item) => (item.photo ? [item.photo] : [])),
  );
  /** The picker's first guess from the photos' GPS. */
  protected readonly guess = computed(() => firstGuess(this.photos()));
  /** How far apart the batch's GPS guesses are. */
  protected readonly spreadM = computed(() => batchSpreadM(this.photos()));
  /** The items that carry a GPS guess, listed by the spread warning. */
  protected readonly gpsItems = computed(() =>
    this.items().filter((item) => item.photo?.gps),
  );

  /** The city slugs the city select offers. */
  protected readonly cities = signal<readonly string[]>([]);
  /** Why the city list did not load, shown with a retry; null when it did. */
  protected readonly citiesFailure = signal<string | null>(null);
  /** The chosen city slug; null until one is chosen. */
  protected readonly city = signal<string | null>(null);
  /** Whether "New city…" is selected and its slug field shown. */
  protected readonly addingCity = signal(false);
  /** Whether a city is being created, so a second tap cannot send the same request again. */
  protected readonly creatingCity = signal(false);
  /** The new city's slug as typed. */
  protected readonly newCitySlug = signal('');
  /** Why the new city was refused, tied to its field; null when fine. */
  protected readonly newCityError = signal<string | null>(null);
  /** The spot's name as typed. */
  protected readonly name = signal('');
  /** The spot's status; new spots start active. */
  protected readonly status = signal<SpotStatus>('active');
  /** The spot's notes as typed; shown verbatim in the spot's detail on the map page. */
  protected readonly notes = signal('');
  /**
   * The position under the picker's pin; null until the picker has loaded, and again whenever the
   * picker is torn down (see {@link pickerOpen}), so a pin from a map that is gone never saves.
   */
  protected readonly position = signal<LngLat | null>(null);
  /**
   * The pin to reopen the picker on after going back to placement; null otherwise. A rebuilt
   * picker emits its own centre as soon as it loads, so it must open on the pin the maintainer
   * placed, not on the GPS guess, or that emit would move the pin back.
   */
  private readonly resumeAt = signal<LngLat | null>(null);

  /** The chosen city's centre: undefined while unknown, null when the database has none. */
  private readonly cityCentre = signal<LngLat | null | undefined>(undefined);
  /** Why the city centre did not load, shown with a retry; null when it did. */
  protected readonly cityCentreFailure = signal<string | null>(null);
  /** The imagery key's request state. */
  protected readonly token = signal<TokenState>({ status: 'loading' });

  /**
   * Where the picker opens: on the pin to resume, if the maintainer went back to placement; else
   * on the batch's GPS guess close up; else, once a city is chosen, on the centre of its spots.
   * Null until one of these is known, so a batch without GPS asks for the city before it shows
   * the map.
   */
  protected readonly view = computed<PickerView | null>(() => {
    const resume = this.resumeAt();
    if (resume) {
      return { centre: resume, zoom: PICKER_DETAIL_ZOOM };
    }
    const guess = this.guess();
    if (guess) {
      return { centre: guess, zoom: PICKER_DETAIL_ZOOM };
    }
    const centre = this.cityCentre();
    if (centre === undefined) {
      return null;
    }
    return centre ? { centre, zoom: PICKER_CITY_ZOOM } : FALLBACK_VIEW;
  });

  /** The imagery key once its request settled; the picker waits for it, so no false notice flashes. */
  protected readonly pickerToken = computed(() => {
    const token = this.token();
    return token.status === 'ready' ? token.token : null;
  });

  /**
   * Whether the picker is on the page (in the place step): it has a view to open on and waits for
   * the imagery key. When this turns false the picker is destroyed, and its position and the pin to
   * resume go with it.
   */
  protected readonly pickerOpen = computed(
    () => this.view() !== null && this.token().status !== 'loading',
  );

  /** Whether everything the save needs is there. */
  protected readonly canSave = computed(
    () =>
      this.photos().length > 0 &&
      this.city() !== null &&
      this.name().trim() !== '' &&
      this.position() !== null,
  );

  /** The spots near the picked position, shown on the resolve step. */
  protected readonly candidates = signal<readonly NearbySpot[]>([]);
  /** The spot the photos landed on, shown on the done step. */
  protected readonly saved = signal<AdminSpot | null>(null);
  /** The failed check or save of the current step, with its retry. */
  protected readonly failure = signal<Failure | null>(null);

  /** The saved spot's thumbnail URLs; none without a photo host. */
  protected readonly savedThumbs = computed(
    () => this.spotPhotos.set(this.saved()?.photos ?? []).thumbs,
  );

  /** What the polite live region says about the step on screen. */
  protected readonly announcement = computed(() => {
    switch (this.step()) {
      case 'processing':
        return `Processing ${this.items().length} photos`;
      case 'checking':
        return this.failure() ? 'Checking failed' : 'Checking for nearby spots';
      case 'saving':
        return this.failure() ? 'Saving failed' : 'Saving';
      case 'done':
        return `Saved ${this.saved()?.name ?? ''}`;
      default:
        return '';
    }
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.revokeAll(this.items()));
    void this.loadCities();
    void this.loadToken();

    // Focus follows every step change (not the first render), once the new step is in the DOM.
    let previous: CreateOrAttachStep | null = null;
    effect(() => {
      const step = this.step();
      if (previous !== null && previous !== step) {
        afterNextRender(
          { write: () => this.stepHeading()?.nativeElement.focus() },
          { injector: this.injector },
        );
      }
      previous = step;
    });

    effect(() => {
      if (!this.pickerOpen()) {
        untracked(() => {
          this.position.set(null);
          this.resumeAt.set(null);
        });
      }
    });
  }

  /** Reads the value of the input, select or textarea an event came from. */
  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  /** Starts a batch from the files the maintainer picked or shot. */
  protected onFilesPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length === 0) {
      return;
    }
    const items = files.map((file): BatchItem => ({
      id: this.nextItemId++,
      file,
      state: 'processing',
      photo: null,
      error: null,
      thumbUrl: null,
    }));
    this.items.set(items);
    this.step.set('processing');
    void this.processAll(items);
  }

  /** Runs the failed photo through the pipeline again. */
  protected retryPhoto(id: number): void {
    const item = this.items().find((candidate) => candidate.id === id);
    if (item) {
      this.updateItem(id, { state: 'processing', error: null });
      void this.processAll([item]);
    }
  }

  /**
   * Takes a photo out of the batch; an empty batch goes back to picking and forgets the pin, so
   * the next batch opens on its own guess.
   */
  protected dropPhoto(id: number): void {
    const dropped = this.items().filter((item) => item.id === id);
    this.revokeAll(dropped);
    this.items.update((items) => items.filter((item) => item.id !== id));
    if (this.items().length === 0) {
      this.forgetPin();
      this.step.set('pick');
      return;
    }
    this.advanceIfProcessed();
    void this.ensureCityCentre();
  }

  /** The city select changed: a slug, or "New city…". */
  protected chooseCity(value: string): void {
    if (value === NEW_CITY) {
      this.addingCity.set(true);
      return;
    }
    this.addingCity.set(false);
    this.city.set(value);
    this.cityCentre.set(undefined);
    if (this.guess() === null) {
      // The picker opens on the city's centre, so it is rebuilt there: a resumed pin is stale.
      this.resumeAt.set(null);
    }
    void this.ensureCityCentre();
  }

  /**
   * Creates the typed city, then selects it. A tap while a creation is in flight does nothing, so
   * the second request cannot fail with "already exists" and leave that message behind.
   */
  protected async createCity(): Promise<void> {
    if (this.creatingCity()) {
      return;
    }
    const slug = this.newCitySlug().trim();
    if (!CITY_SLUG_PATTERN.test(slug)) {
      this.newCityError.set(
        'Use lowercase letters, digits and single hyphens, e.g. "new-york".',
      );
      return;
    }
    this.newCityError.set(null);
    this.creatingCity.set(true);
    try {
      await this.repository.createCity(slug);
      this.cities.set(await this.repository.listCities());
    } catch (error) {
      this.newCityError.set(messageOf(error));
      return;
    } finally {
      this.creatingCity.set(false);
    }
    this.newCitySlug.set('');
    this.chooseCity(slug);
  }

  /** Loads the city list; a failure shows its message and a retry. */
  protected async loadCities(): Promise<void> {
    this.citiesFailure.set(null);
    try {
      this.cities.set(await this.repository.listCities());
    } catch (error) {
      this.citiesFailure.set(messageOf(error));
    }
  }

  /** Loads the imagery key, when the provider needs one. */
  protected async loadToken(): Promise<void> {
    const setting = this.imagery.tokenSetting;
    if (setting === null) {
      this.token.set({ status: 'ready', token: null });
      return;
    }
    this.token.set({ status: 'loading' });
    try {
      this.token.set({
        status: 'ready',
        token: await this.repository.imageryToken(setting),
      });
    } catch (error) {
      this.token.set({ status: 'failed', message: messageOf(error) });
    }
  }

  /** Asks for the chosen city's centre when the batch has no GPS guess to open on. */
  protected async ensureCityCentre(): Promise<void> {
    const city = this.city();
    if (
      this.guess() !== null ||
      city === null ||
      this.cityCentre() !== undefined
    ) {
      return;
    }
    this.cityCentreFailure.set(null);
    try {
      const centre = await this.repository.cityCentre(city);
      if (this.city() === city) {
        this.cityCentre.set(centre);
      }
    } catch (error) {
      this.cityCentreFailure.set(messageOf(error));
    }
  }

  /** Checks for spots near the picked position; none → create straight away. */
  protected async check(): Promise<void> {
    const position = this.position();
    if (!this.canSave() || position === null) {
      return;
    }
    this.failure.set(null);
    this.step.set('checking');
    try {
      const candidates = await this.repository.nearbySpots(
        position,
        this.name().trim(),
      );
      this.candidates.set(candidates);
      if (candidates.length === 0) {
        await this.createNew();
      } else {
        this.step.set('resolve');
      }
    } catch (error) {
      this.failure.set({
        message: messageOf(error),
        retry: () => void this.check(),
      });
    }
  }

  /**
   * Creates a new spot with the batch, whatever is nearby. When a try ends with the outcome
   * unknown (the response was lost, so the spot may exist), its Retry resumes under the same spot
   * id: the repository then reads the spot first instead of asking for a fresh id, which would
   * create a second spot beside the first.
   */
  protected createNew(): Promise<void> {
    const position = this.position();
    const city = this.city();
    if (position === null || city === null) {
      return Promise.resolve();
    }
    const notes = this.notes().trim();
    const fields = {
      city,
      name: this.name().trim(),
      status: this.status(),
      notes: notes === '' ? null : notes,
      position,
    };
    let pendingSpotId: string | undefined;
    return this.save(async () => {
      try {
        return await this.repository.createSpotWithPhotos(
          fields,
          this.photos(),
          pendingSpotId,
        );
      } catch (error) {
        pendingSpotId =
          error instanceof AdminRepositoryError
            ? error.pendingSpotId
            : undefined;
        throw error;
      }
    });
  }

  /** Attaches the batch to a live candidate. */
  protected attach(candidate: NearbySpot): Promise<void> {
    return this.save(async () =>
      this.repository.attachPhotos(
        await this.repository.getSpot(candidate.id),
        this.photos(),
      ),
    );
  }

  /** Restores a soft-deleted candidate, then attaches the batch to it. */
  protected restoreAndAttach(candidate: NearbySpot): Promise<void> {
    return this.save(async () =>
      this.repository.attachPhotos(
        await this.repository.restoreSpot(candidate.id),
        this.photos(),
      ),
    );
  }

  /**
   * Goes back to placement, keeping every field and the pin: the rebuilt picker opens on the pin
   * the maintainer placed (see {@link resumeAt}), so its first emit reports that same position.
   */
  protected backToPlace(): void {
    this.failure.set(null);
    this.resumeAt.set(this.position());
    this.step.set('place');
  }

  /** Drops the placed pin and the pin to resume, so a picker built next opens on the batch's own guess. */
  private forgetPin(): void {
    this.position.set(null);
    this.resumeAt.set(null);
  }

  /** Starts a new batch; the city stays chosen for the next spot. */
  protected addAnother(): void {
    this.revokeAll(this.items());
    this.items.set([]);
    this.name.set('');
    this.status.set('active');
    this.notes.set('');
    this.forgetPin();
    this.cityCentre.set(undefined);
    this.candidates.set([]);
    this.saved.set(null);
    this.failure.set(null);
    this.step.set('pick');
  }

  /** Runs one write on the saving step; a failure stays there with a retry of the same write. */
  private async save(write: () => Promise<AdminSpot>): Promise<void> {
    this.failure.set(null);
    this.step.set('saving');
    try {
      this.saved.set(await write());
      this.step.set('done');
    } catch (error) {
      this.failure.set({
        message: messageOf(error),
        retry: () => void this.save(write),
      });
    }
  }

  /** Processes the items one at a time — a phone holds one decoded photo, not a batch of them. */
  private async processAll(items: readonly BatchItem[]): Promise<void> {
    for (const item of items) {
      try {
        const photo = await this.pipeline.process(item.file);
        this.updateItem(item.id, {
          state: 'done',
          photo,
          thumbUrl: URL.createObjectURL(photo.thumb),
        });
      } catch (error) {
        this.updateItem(item.id, { state: 'failed', error: messageOf(error) });
      }
    }
    this.advanceIfProcessed();
  }

  /** Moves on to placement once every photo left in the batch is processed. */
  private advanceIfProcessed(): void {
    const items = this.items();
    if (
      this.step() === 'processing' &&
      items.length > 0 &&
      items.every((item) => item.state === 'done')
    ) {
      this.step.set('place');
      untracked(() => void this.ensureCityCentre());
    }
  }

  /** Applies a partial update to one batch item. */
  private updateItem(id: number, patch: Partial<BatchItem>): void {
    this.items.update((items) =>
      items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  /** Releases the object URLs of the given items' thumbnails. */
  private revokeAll(items: readonly BatchItem[]): void {
    for (const item of items) {
      if (item.thumbUrl) {
        URL.revokeObjectURL(item.thumbUrl);
      }
    }
  }
}
