/**
 * Template media — resolves {{$media 'name'}} placeholders into absolute URLs
 * pointing at files the mock server serves off disk.
 *
 * Kept apart from template-helpers because this one needs a lookup: the other
 * helpers are functions of the request alone, this one has to ask what is
 * registered. The lookup arrives as an argument so the resolver stays pure.
 */

/** URL prefix the mock server serves registered media under. */
export const MEDIA_URL_PREFIX = '/__mocka/media/';

const MEDIA_REGEX = /\{\{\s*\$media\s+['"]([^'"]*)['"]\s*\}\}/g;

export interface MediaRef {
  fileName: string;
}

/**
 * Build the absolute URL for a stored file.
 *
 * The host comes from the request rather than from settings, so the same mock
 * answers a simulator on localhost and a real device on the LAN with an address
 * each of them can actually reach.
 */
export function buildMediaUrl(host: string, fileName: string): string {
  return `http://${host}${MEDIA_URL_PREFIX}${encodeURIComponent(fileName)}`;
}

/**
 * Replace every {{$media 'name'}} with the file's URL.
 *
 * An unknown name is left as-is rather than blanked: a response carrying a
 * visible `{{$media 'typo'}}` says what went wrong, while an empty string looks
 * like a server that answered fine and leaves the reader hunting in the app.
 */
export function resolveMedia(
  template: string,
  host: string | undefined,
  lookup: (name: string) => MediaRef | null,
  onMissing?: (name: string) => void,
): string {
  if (!host) return template;
  return template.replace(MEDIA_REGEX, (fullMatch, name: string) => {
    const media = lookup(name);
    if (!media) {
      onMissing?.(name);
      return fullMatch;
    }
    return buildMediaUrl(host, media.fileName);
  });
}
