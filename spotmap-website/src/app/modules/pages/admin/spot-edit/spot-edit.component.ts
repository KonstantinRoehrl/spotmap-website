import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type {
  AdminSpot,
  LngLat,
  SpotPatch,
} from '../../../../models/admin/admin-spot';
import type { SpotStatus } from '../../../../models/spots/spot';
import { AdminRepository } from '../../../../services/admin/admin-repository';
import { IMAGERY_CONFIG } from '../../../../services/admin/imagery';
import {
  PhotoPipeline,
  type ProcessedPhoto,
} from '../../../../services/admin/photo-pipeline/photo-pipeline';
import {
  photoUrl,
  SPOTMAP_BACKEND,
} from '../../../../services/spotmap-backend';
import {
  PICKER_DETAIL_ZOOM,
  SatellitePickerComponent,
} from '../../../components/admin/satellite-picker/satellite-picker.component';
import { PointerBloomDirective } from '../../../directives/pointer-bloom.directive';

/** The statuses a spot can take, in the order the status field offers them. */
const SPOT_STATUSES: readonly SpotStatus[] = ['active', 'demolished'];

/** What the details form holds: the name, status and notes as the maintainer typed them. */
export interface SpotDraft {
  name: string;
  status: SpotStatus;
  notes: string;
}

/**
 * The fields of `draft` that differ from the saved `spot`, for one `updateSpot` call. The name is
 * compared and sent trimmed; notes blank once trimmed mean no notes (`null`), other notes are
 * sent verbatim, line breaks kept.
 */
export function buildPatch(spot: AdminSpot, draft: SpotDraft): SpotPatch {
  const patch: SpotPatch = {};
  const name = draft.name.trim();
  if (name !== spot.name.trim()) {
    patch.name = name;
  }
  if (draft.status !== spot.status) {
    patch.status = draft.status;
  }
  const notes = draft.notes.trim() === '' ? null : draft.notes;
  if (notes !== spot.notes) {
    patch.notes = notes;
  }
  return patch;
}

/** A write the edit page makes; each has its own wording in the status line. */
export type SpotEditAction =
  | 'details'
  | 'position'
  | 'reorder'
  | 'remove-photo'
  | 'add-photos'
  | 'delete'
  | 'restore';

/** What the status line says: nothing yet, or the latest write in flight, saved or failed. */
export type SpotEditStatus =
  { kind: 'idle' } | { kind: 'saving' | 'saved' | 'error'; text: string };

/** Per write: the line while it runs, once it is saved, and the lead-in to its failure message. */
const ACTION_TEXT: Record<
  SpotEditAction,
  { saving: string; saved: string; failed: string }
> = {
  details: {
    saving: 'Saving the details…',
    saved: 'Details saved.',
    failed: 'Could not save the details',
  },
  position: {
    saving: 'Moving the pin…',
    saved: 'Pin moved.',
    failed: 'Could not move the pin',
  },
  reorder: {
    saving: 'Reordering the photos…',
    saved: 'Photos reordered.',
    failed: 'Could not reorder the photos',
  },
  'remove-photo': {
    saving: 'Removing the photo…',
    saved: 'Photo removed.',
    failed: 'Could not remove the photo',
  },
  'add-photos': {
    saving: 'Adding the photos…',
    saved: 'Photos added.',
    failed: 'Could not add the photos',
  },
  delete: {
    saving: 'Deleting the spot…',
    saved: 'Spot deleted. It no longer shows on the public map.',
    failed: 'Could not delete the spot',
  },
  restore: {
    saving: 'Restoring the spot…',
    saved: 'Spot restored.',
    failed: 'Could not restore the spot',
  },
};

/** The photo-strip buttons focus returns to after a move or a confirmation. */
type PhotoControl =
  'photo-earlier' | 'photo-later' | 'photo-remove' | 'photo-remove-cancel';

/** The message shown for a failed call: an Error's own message, which the repository and pipeline word for the maintainer. */
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The edit page for one spot, `/admin/spots/:id` (read from `ActivatedRoute`, since the router
 * has no component input binding): rename it, change its status and notes, move its pin on the
 * satellite picker, reorder (earlier / later buttons, never drag-only), remove and add photos, and
 * delete or restore it. Every change is one repository write and one write runs at a time; the
 * status line (`aria-live`) says while it saves, when it is saved and what failed, and a failed
 * write leaves every field as the maintainer left it. Removing a photo and deleting the spot are
 * confirmed in the page, never in a browser dialog. Every state of the load has an `h1` (loading,
 * the spot's name, the load failure), so the shell's focus move after navigation lands on a
 * labelled heading and the finished load moves focus on to the next one.
 */
@Component({
  selector: 'app-spot-edit',
  imports: [RouterLink, PointerBloomDirective, SatellitePickerComponent],
  templateUrl: './spot-edit.component.html',
  styleUrls: ['../admin-shared.css', './spot-edit.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotEditComponent {
  private readonly repository = inject(AdminRepository);
  private readonly pipeline = inject(PhotoPipeline);
  private readonly backend = inject(SPOTMAP_BACKEND);
  private readonly imagery = inject(IMAGERY_CONFIG);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  protected readonly statuses = SPOT_STATUSES;
  protected readonly pickerZoom = PICKER_DETAIL_ZOOM;

  private spotId = '';
  /** Counts loads, so a slower answer for an earlier id never replaces the current spot. */
  private request = 0;
  protected readonly load = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly loadError = signal('');
  protected readonly spot = signal<AdminSpot | null>(null);

  protected readonly name = signal('');
  protected readonly status = signal<SpotStatus>('active');
  protected readonly notes = signal('');

  protected readonly editStatus = signal<SpotEditStatus>({ kind: 'idle' });
  protected readonly busy = computed(() => this.editStatus().kind === 'saving');
  /** The status line's message, in a list so a new message replaces the old with a crossfade. */
  protected readonly statusLines = computed(() => {
    const status = this.editStatus();
    return status.kind === 'idle' ? [] : [status.text];
  });

  protected readonly nameError = computed(() =>
    this.name().trim() === '' ? 'A spot needs a name.' : null,
  );
  /** The changes the form holds against the saved spot; empty while nothing differs. */
  private readonly patch = computed<SpotPatch>(() => {
    const spot = this.spot();
    return spot
      ? buildPatch(spot, {
          name: this.name(),
          status: this.status(),
          notes: this.notes(),
        })
      : {};
  });
  protected readonly canSaveDetails = computed(
    () => this.nameError() === null && Object.keys(this.patch()).length > 0,
  );

  protected readonly positionText = computed(() => {
    const spot = this.spot();
    return spot ? `${spot.lat.toFixed(6)}, ${spot.lng.toFixed(6)}` : '';
  });
  protected readonly pickerOpen = signal(false);
  /** Where the open picker started; fixed while it is open, so other edits never move its view. */
  protected readonly pickerCentre = signal<LngLat | null>(null);
  protected readonly imageryToken = signal<string | null>(null);
  protected readonly pickedPosition = signal<LngLat | null>(null);
  /** Whether the picked position differs from the saved one, so there is something to move. */
  protected readonly canSavePosition = computed(() => {
    const picked = this.pickedPosition();
    const spot = this.spot();
    return (
      picked !== null &&
      spot !== null &&
      (picked.lng !== spot.lng || picked.lat !== spot.lat)
    );
  });

  /** The photo whose removal is waiting for confirmation; null when none. */
  protected readonly confirmingRemoval = signal<string | null>(null);
  protected readonly confirmingDelete = signal(false);
  /** Photos that just swapped places, dimmed for one frame so the swap fades in. */
  protected readonly settling = signal<ReadonlySet<string>>(new Set());

  constructor() {
    inject(ActivatedRoute)
      .paramMap.pipe(takeUntilDestroyed())
      .subscribe((params) => {
        this.spotId = params.get('id') ?? '';
        void this.reload();
      });
  }

  /** Loads the spot and fills the form from it; the retry button calls it too. */
  protected async reload(): Promise<void> {
    const request = ++this.request;
    this.load.set('loading');
    try {
      const spot = await this.repository.getSpot(this.spotId);
      if (request !== this.request) return;
      this.spot.set(spot);
      this.name.set(spot.name);
      this.status.set(spot.status);
      this.notes.set(spot.notes ?? '');
      this.settleLoad('ready');
    } catch (error) {
      if (request !== this.request) return;
      this.loadError.set(errorText(error));
      this.settleLoad('error');
    }
  }

  /**
   * Shows the finished load and, when focus was on this page's own loading or error state (or had
   * fallen to the document once that state faded out), moves it to the new state's `h1`. The
   * shell's single focus move after navigation lands on the loading heading, which is gone by
   * then; moving focus to the spot's name makes a screen reader announce it. Focus the maintainer
   * moved elsewhere (the shell's links) is left alone.
   */
  private settleLoad(state: 'ready' | 'error'): void {
    const active = document.activeElement;
    const focusIsHere =
      active === null || active === document.body || this.host.contains(active);
    this.load.set(state);
    if (focusIsHere) {
      this.focusAfterRender(
        state === 'ready'
          ? '[data-testid="edit-title"]'
          : '[data-testid="edit-error"]:not(.fade--leaving) h1',
      );
    }
  }

  /** The text a text field or text area holds after `event`. */
  protected inputValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  }

  /** The status the status select shows after `event`. */
  protected selectedStatus(event: Event): SpotStatus {
    return (event.target as HTMLSelectElement).value as SpotStatus;
  }

  /** The public URL of a photo's thumbnail; null when the backend has no photo base URL. */
  protected thumbUrl(key: string): string | null {
    return this.backend.photoBaseUrl === ''
      ? null
      : photoUrl(this.backend.photoBaseUrl, key, 'thumb');
  }

  /** The details form's submit: one `updateSpot` with only the changed fields. */
  protected async onDetailsSubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy() || !this.canSaveDetails()) return;
    const patch = this.patch();
    await this.run('details', () =>
      this.repository.updateSpot(this.spotId, patch),
    );
  }

  /** Opens the picker on the spot's position at detail zoom, fetching the imagery key first. */
  protected async openPicker(): Promise<void> {
    const spot = this.spot();
    if (spot === null || this.busy()) return;
    const setting = this.imagery.tokenSetting;
    if (setting !== null && this.imageryToken() === null) {
      try {
        this.imageryToken.set(await this.repository.imageryToken(setting));
      } catch (error) {
        this.editStatus.set({
          kind: 'error',
          text: `Could not load the satellite imagery key: ${errorText(error)}`,
        });
        return;
      }
      if (this.imageryToken() === null) {
        this.editStatus.set({
          kind: 'error',
          text: `No satellite imagery key is stored: add the ${setting} row to admin_settings.`,
        });
        return;
      }
    }
    this.pickerCentre.set({ lng: spot.lng, lat: spot.lat });
    this.pickedPosition.set(null);
    this.pickerOpen.set(true);
    this.focusAfterRender('[data-testid="picker-title"]');
  }

  /** Closes the picker without saving and returns focus to the button that opened it. */
  protected closePicker(): void {
    this.pickerOpen.set(false);
    this.focusAfterRender('[data-testid="move-pin"]');
  }

  /** Saves the picked position as one update and closes the picker once it is saved. */
  protected async savePosition(): Promise<void> {
    const position = this.pickedPosition();
    if (position === null || this.busy() || !this.canSavePosition()) return;
    if (
      await this.run('position', () =>
        this.repository.updateSpot(this.spotId, { position }),
      )
    ) {
      this.closePicker();
    }
  }

  /** Swaps a photo with its neighbour (`offset` −1 earlier, +1 later) and keeps focus on it. */
  protected async movePhoto(key: string, offset: -1 | 1): Promise<void> {
    const spot = this.spot();
    if (spot === null || this.busy()) return;
    const from = spot.photos.indexOf(key);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= spot.photos.length) return;
    const keys = [...spot.photos];
    [keys[from], keys[to]] = [keys[to], keys[from]];
    if (
      await this.run('reorder', () =>
        this.repository.reorderPhotos(this.spotId, keys),
      )
    ) {
      this.settle([key, keys[from]]);
      const atEdge = offset < 0 ? to === 0 : to === keys.length - 1;
      this.focusPhotoControl(
        key,
        offset < 0 === !atEdge ? 'photo-earlier' : 'photo-later',
      );
    }
  }

  /** Opens a photo's in-page removal confirmation and focuses its safe choice, Keep. */
  protected askRemovePhoto(key: string): void {
    this.confirmingRemoval.set(key);
    this.focusPhotoControl(key, 'photo-remove-cancel');
  }

  /** Closes a photo's removal confirmation and returns focus to its Remove button. */
  protected cancelRemovePhoto(key: string): void {
    this.confirmingRemoval.set(null);
    this.focusPhotoControl(key, 'photo-remove');
  }

  /** Removes a confirmed photo: the row, then both files (the repository's order). */
  protected async removePhoto(key: string): Promise<void> {
    const spot = this.spot();
    if (spot === null || this.busy()) return;
    if (
      await this.run('remove-photo', () =>
        this.repository.removePhoto(spot, key),
      )
    ) {
      this.confirmingRemoval.set(null);
      this.focusAfterRender('[data-testid="photos-title"]');
    }
  }

  /** Runs every picked file through the pipeline in order, then attaches them all in one call. */
  protected async addPhotos(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    const spot = this.spot();
    if (spot === null || files.length === 0 || this.busy()) return;
    const photos: ProcessedPhoto[] = [];
    for (const [index, file] of files.entries()) {
      this.editStatus.set({
        kind: 'saving',
        text: `Preparing photo ${index + 1} of ${files.length}…`,
      });
      try {
        photos.push(await this.pipeline.process(file));
      } catch (error) {
        this.editStatus.set({
          kind: 'error',
          text: `Could not prepare ${file.name}: ${errorText(error)}`,
        });
        return;
      }
    }
    await this.run('add-photos', () =>
      this.repository.attachPhotos(spot, photos),
    );
  }

  /** Opens the in-page delete confirmation and focuses its safe choice, Keep. */
  protected askDelete(): void {
    this.confirmingDelete.set(true);
    this.focusAfterRender('[data-testid="delete-cancel"]');
  }

  /** Closes the delete confirmation and returns focus to the Delete button. */
  protected cancelDelete(): void {
    this.confirmingDelete.set(false);
    this.focusAfterRender('[data-testid="delete-spot"]');
  }

  /** Deletes the confirmed spot, then focuses Restore, which takes Delete's place. */
  protected async deleteSpot(): Promise<void> {
    if (this.busy()) return;
    if (
      await this.run('delete', () => this.repository.deleteSpot(this.spotId))
    ) {
      this.confirmingDelete.set(false);
      this.focusAfterRender('[data-testid="restore-spot"]');
    }
  }

  /** Restores the deleted spot, then focuses Delete, which takes Restore's place. */
  protected async restoreSpot(): Promise<void> {
    if (this.busy()) return;
    if (
      await this.run('restore', () => this.repository.restoreSpot(this.spotId))
    ) {
      this.focusAfterRender('[data-testid="delete-spot"]');
    }
  }

  /**
   * Runs one write: announces it, takes the spot it returns, and on failure names it and leaves
   * every field alone.
   * @returns whether the write succeeded
   */
  private async run(
    action: SpotEditAction,
    write: () => Promise<AdminSpot>,
  ): Promise<boolean> {
    const text = ACTION_TEXT[action];
    this.editStatus.set({ kind: 'saving', text: text.saving });
    try {
      this.spot.set(await write());
      this.editStatus.set({ kind: 'saved', text: text.saved });
      return true;
    } catch (error) {
      this.editStatus.set({
        kind: 'error',
        text: `${text.failed}: ${errorText(error)}`,
      });
      return false;
    }
  }

  /** Dims `keys` for one frame without a transition, then lets them fade back in. */
  private settle(keys: readonly string[]): void {
    this.settling.set(new Set(keys));
    afterNextRender(
      () => requestAnimationFrame(() => this.settling.set(new Set())),
      { injector: this.injector },
    );
  }

  /** Focuses the first element matching `selector` once the next render has put it in the page. */
  private focusAfterRender(selector: string): void {
    afterNextRender(
      () => this.host.querySelector<HTMLElement>(selector)?.focus(),
      { injector: this.injector },
    );
  }

  /** Focuses `control` of the photo `key` once the next render has put it in the page. */
  private focusPhotoControl(key: string, control: PhotoControl): void {
    this.focusAfterRender(
      `[data-key="${CSS.escape(key)}"] [data-testid="${control}"]`,
    );
  }
}
