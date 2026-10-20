import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AdminSpot } from '../../../../models/admin/admin-spot';
import { AdminRepository } from '../../../../services/admin/admin-repository';
import { PointerBloomDirective } from '../../../directives/pointer-bloom.directive';

/** Where the list is in fetching the spots it shows. */
export type SpotListLoad = 'loading' | 'ready' | 'error';

/** The city filter's "every city" value; its other values are city slugs. */
export const ALL_CITIES = '';

/** Whether `spot`'s name contains `filter`, trimmed and case-insensitive; a blank filter matches every spot. */
export function matchesName(spot: AdminSpot, filter: string): boolean {
  const needle = filter.trim().toLowerCase();
  return needle === '' || spot.name.toLowerCase().includes(needle);
}

/** The message shown for a failed call: an Error's own message, which the repository words for the maintainer. */
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The admin spot list, `/admin/spots`: every spot of one city or of all, filtered by name, with
 * soft-deleted spots shown only on request, each row linking to its edit page. The city filter
 * asks the database again (`listSpots(city)`); the name filter and the deleted toggle filter the
 * rows already loaded. A status line (`aria-live`) announces loading, the row count and failures.
 */
@Component({
  selector: 'app-spot-list',
  imports: [RouterLink, PointerBloomDirective],
  templateUrl: './spot-list.component.html',
  styleUrls: ['../admin-shared.css', './spot-list.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpotListComponent implements OnInit {
  private readonly repository = inject(AdminRepository);

  protected readonly allCities = ALL_CITIES;
  protected readonly cities = signal<readonly string[]>([]);
  /** Why the city list could not be loaded, shown under the city filter; null when it loaded. */
  protected readonly citiesError = signal<string | null>(null);
  protected readonly city = signal(ALL_CITIES);
  protected readonly nameFilter = signal('');
  protected readonly includeDeleted = signal(false);
  protected readonly load = signal<SpotListLoad>('loading');
  protected readonly loadError = signal('');
  private readonly spots = signal<readonly AdminSpot[]>([]);
  /** Counts spot requests, so a slower answer for an earlier city never replaces the current one. */
  private request = 0;

  /** The loaded spots the deleted toggle lets through: what the name filter then narrows. */
  private readonly listedSpots = computed(() =>
    this.spots().filter(
      (spot) => this.includeDeleted() || spot.deletedAt === null,
    ),
  );

  /** The listed spots the name filter lets through, in the database's order. */
  protected readonly visibleSpots = computed(() =>
    this.listedSpots().filter((spot) => matchesName(spot, this.nameFilter())),
  );

  /** The status line's one message, in a list so a new message replaces the old with a crossfade. */
  protected readonly statusLines = computed(() => {
    switch (this.load()) {
      case 'loading':
        return ['Loading spots…'];
      case 'error':
        return [`Could not load the spots: ${this.loadError()}`];
      default: {
        const total = this.listedSpots().length;
        return [
          `${this.visibleSpots().length} of ${total} ${total === 1 ? 'spot' : 'spots'}`,
        ];
      }
    }
  });

  ngOnInit(): void {
    this.reload();
  }

  /** Fetches the city list and the chosen city's spots; both retry buttons call it. */
  protected reload(): void {
    void this.loadCities();
    void this.loadSpots();
  }

  /** Remembers the chosen city and asks the database for its spots. */
  protected onCityChange(event: Event): void {
    this.city.set((event.target as HTMLSelectElement).value);
    void this.loadSpots();
  }

  /** Remembers the name filter as typed. */
  protected onNameInput(event: Event): void {
    this.nameFilter.set((event.target as HTMLInputElement).value);
  }

  /** Remembers whether deleted spots are listed. */
  protected onIncludeDeletedChange(event: Event): void {
    this.includeDeleted.set((event.target as HTMLInputElement).checked);
  }

  /** "1 photo" / "n photos". */
  protected photoCount(spot: AdminSpot): string {
    const count = spot.photos.length;
    return count === 1 ? '1 photo' : `${count} photos`;
  }

  /** Fills the city filter's options; a failure is shown under the filter instead. */
  private async loadCities(): Promise<void> {
    this.citiesError.set(null);
    try {
      this.cities.set(await this.repository.listCities());
    } catch (error) {
      this.citiesError.set(`Could not load the cities: ${errorText(error)}`);
    }
  }

  /** Fetches the spots of the chosen city; only the newest request's answer is kept. */
  private async loadSpots(): Promise<void> {
    const request = ++this.request;
    this.load.set('loading');
    try {
      const spots = await this.repository.listSpots(
        this.city() === ALL_CITIES ? null : this.city(),
      );
      if (request !== this.request) return;
      this.spots.set(spots);
      this.load.set('ready');
    } catch (error) {
      if (request !== this.request) return;
      this.loadError.set(errorText(error));
      this.load.set('error');
    }
  }
}
