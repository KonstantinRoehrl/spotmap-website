import { InjectionToken } from '@angular/core';

/** How a share ended: the sheet took it, the visitor dismissed it, or the link was (not) copied. */
export type ShareOutcome = 'shared' | 'cancelled' | 'copied' | 'copy-failed';

/** The parts of `navigator` a share uses; any of them may be missing at run time. */
export type ShareNavigator = Pick<
  Navigator,
  'share' | 'canShare' | 'clipboard'
>;

/**
 * The navigator {@link shareSpot} talks to. The browser's own outside tests; specs provide a fake
 * so they never open a real share sheet or write the real clipboard.
 */
export const SHARE_NAVIGATOR = new InjectionToken<ShareNavigator>(
  'SHARE_NAVIGATOR',
  { providedIn: 'root', factory: () => navigator },
);

/**
 * The absolute link to a spot, `<origin><base href>spot/<id>`. Resolved against the document's
 * base URI, so the deploy's `/spotmap-website/` prefix is kept; the id is one encoded path segment.
 *
 * @param id the spot's id
 * @param baseUri what the link resolves against; the document's base URI unless a spec says otherwise
 */
export function spotLink(
  id: string,
  baseUri: string = document.baseURI,
): string {
  return new URL(`spot/${encodeURIComponent(id)}`, baseUri).href;
}

/**
 * Shares a spot's link: through the native share sheet where the browser offers one for it,
 * otherwise by copying the link. A dismissed sheet (`AbortError`) is the visitor's choice and
 * copies nothing; a sheet that fails any other way falls back to the copy.
 *
 * @param link the absolute link, from {@link spotLink}
 * @param title the spot's name, the shared item's title
 * @param nav the navigator to use; the browser's by default
 */
export async function shareSpot(
  link: string,
  title: string,
  nav: ShareNavigator = navigator,
): Promise<ShareOutcome> {
  const data: ShareData = { url: link, title };
  const canShare =
    typeof nav.share === 'function' &&
    (typeof nav.canShare !== 'function' || nav.canShare(data));
  if (canShare) {
    try {
      await nav.share(data);
      return 'shared';
    } catch (error) {
      if ((error as { name?: string } | null)?.name === 'AbortError') {
        return 'cancelled';
      }
    }
  }
  try {
    if (!nav.clipboard?.writeText) {
      return 'copy-failed';
    }
    await nav.clipboard.writeText(link);
    return 'copied';
  } catch {
    return 'copy-failed';
  }
}
