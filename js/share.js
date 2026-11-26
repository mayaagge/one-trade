// js/share.js - getting something out of the browser, for every screen that shares.
//
// WHY THIS FILE EXISTS. The daily puzzle shares a grid of squares and the Learn
// levels share a picture of a score, and the two were going to need the same
// four things: where the game lives, the source code on the link, a share sheet
// where there is one, and a clipboard where there is not. All of that lived
// inside js/dailyView.js, where only the puzzle could reach it. It is here so
// there is one answer to "what happens when a player taps Share" rather than
// one per mode - and so a fix to the clipboard fallback fixes both.
//
// WHAT IT KNOWS ABOUT, and nothing more: a string, and optionally a file. It
// does not know what a puzzle is, what a level is, or what is in the picture.
// The words are built by js/daily.js and js/shareCard.js, which are pure and
// tested without a browser; this file only carries them out of it.
//
// NOTHING IS SENT ANYWHERE. Every path here hands the content to the player -
// the system share sheet, the clipboard, a download - and none of them is a
// request to a server. docs/PRD.md allows the Worker two kinds of message and
// neither is a share.
//
// Educational, not investment advice.

/**
 * Where the game lives, for a link somebody else will open.
 *
 * ABOUT.url when the deploy has set it; otherwise the page this is running on,
 * which is right on a laptop and right on the live site. An empty string if
 * there is neither - a share with no link beats a share button that throws.
 */
export function shareUrl(about, location) {
  const configured = about?.url;
  if (typeof configured === 'string' && configured.length > 0) return configured;
  if (location?.origin) return `${location.origin}${location.pathname ?? ''}`;
  return '';
}

/**
 * The source code docs/PRD.md asks every shared link to carry, so the count
 * ping can tell which channel works without tracking anybody: ?src=daily from
 * the puzzle, ?src=share from a score card.
 *
 * It is the ONLY thing added to the link. Nothing about the portfolio, the
 * draw or the guess goes in a query string: a link that encoded the day's
 * portfolio would hand the answer to whoever opened it.
 */
export function withSource(url, source, mode = null) {
  if (!url) return '';
  const asked = `${url}${url.includes('?') ? '&' : '?'}src=${source}`;
  // THE MODE GOES LAST, because a hash ends a URL: anything after it is part of
  // the fragment, not of the query. Without one the link falls through to
  // js/app.js's default, which is how every shared card used to land on the
  // Research page - a methods report, handed to somebody who was sent a game.
  return mode ? `${asked}#${mode}` : asked;
}

/** Copy to the clipboard, or fall back to something the player can select. */
export async function copyOut(text, say, holder) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      say('Copied.');
      return;
    }
  } catch {
    // Permission refused, or no clipboard: fall through to the textarea.
  }
  const box = document.createElement('textarea');
  box.className = 'share-text';
  box.readOnly = true;
  box.value = text;
  box.rows = 5;
  holder.replaceChildren(box);
  box.focus();
  box.select();
  say('Copy the text above.');
}

/**
 * Share some text, with a file where the browser will take one.
 *
 * A phone gets the sheet it expects, with the picture in it. A laptop browser
 * that has navigator.share but will not take files gets the text and the link,
 * which is still a share. Everything else falls to the caller's fallback - the
 * clipboard, or a download - because a Share button that silently does nothing
 * is worse than no Share button.
 *
 * @param {string} options.text   what to post
 * @param {File} [options.file]   the picture, where there is one
 * @returns {Promise<string>} 'shared', 'cancelled', or 'unsupported'
 */
export async function shareOut({ text, file = null }) {
  const canShareFile = Boolean(file)
    && typeof navigator.canShare === 'function'
    && navigator.canShare({ files: [file] });

  if (navigator.share) {
    try {
      await navigator.share(canShareFile ? { files: [file], text } : { text });
      return 'shared';
    } catch (error) {
      // A cancelled share is not a failure and should say nothing.
      if (error?.name === 'AbortError') return 'cancelled';
    }
  }
  return 'unsupported';
}

/**
 * A canvas as a PNG file, named so a player can find it again.
 *
 * toBlob is callback-shaped and older WebKit has no toBlob at all, so this is
 * the one place that knows about either.
 */
export function canvasToFile(canvas, fileName) {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      reject(new Error('this browser cannot turn a canvas into an image'));
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('the card could not be turned into an image'));
        return;
      }
      resolve(typeof File === 'function'
        ? new File([blob], fileName, { type: 'image/png' })
        : blob);
    }, 'image/png');
  });
}

/**
 * Offer the image as a download. Used where the share sheet will not take a
 * file, which is most laptops.
 *
 * The object URL is revoked on the next frame rather than immediately: Safari
 * reads it after the click handler returns.
 */
export function downloadFile(file, fileName) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
