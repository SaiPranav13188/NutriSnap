import type { RingState } from '@nutrisnap/core';
import type { Theme } from '@nutrisnap/ui';

/**
 * What colour each ring state is drawn in.
 *
 * Shared by the calendar strip and the screen that explains it, for the same
 * reason the thresholds live in core rather than in either one: a legend
 * maintained separately from the thing it describes is a legend that goes
 * quietly wrong the first time a colour is retuned.
 *
 * The greens, ambers and reds are the theme's own state colours rather than
 * fixed hex, so the strip keeps working when the theme is toggled.
 */
export function ringColorFor(state: RingState, c: Theme): string {
  switch (state) {
    case 'onTarget':
      return c.state.success;
    case 'close':
      return c.state.warning;
    case 'over':
      return c.state.danger;
    // Both of the quiet states are the same grey. They are told apart by the
    // ring being broken or whole, not by its colour — an unlogged day and a
    // day still in progress are both simply "nothing to report yet".
    case 'under':
    case 'empty':
    default:
      return c.glass.borderStrong;
  }
}
