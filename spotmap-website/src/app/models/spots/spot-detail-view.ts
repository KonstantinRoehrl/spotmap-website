import { SpotDetail, SpotListFeature } from './spot';

/**
 * What the detail pane shows for the spot the URL selects. `loading` and `failed` carry the list
 * row the spot was opened from, when there was one, so its name and first photo show at once and
 * stay up while a RETRY is offered; a cold `/spot/<id>` open has no row (`preview: null`).
 * `loaded` carries the full record. `id` is the selected spot's id in every state.
 */
export type SpotDetailView =
  | {
      readonly status: 'loading';
      readonly id: string;
      readonly preview: SpotListFeature | null;
    }
  | {
      readonly status: 'loaded';
      readonly id: string;
      readonly spot: SpotDetail;
    }
  | {
      readonly status: 'failed';
      readonly id: string;
      readonly preview: SpotListFeature | null;
    };
