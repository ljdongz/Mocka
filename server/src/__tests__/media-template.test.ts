import { describe, it, expect, vi } from 'vitest';
import { buildMediaUrl, resolveMedia, MEDIA_URL_PREFIX } from '../utils/template-media.js';

const lookup = (name: string) => (name === 'clip' ? { fileName: 'abc-123.mp4' } : null);

describe('resolveMedia', () => {
  it('replaces the placeholder with a URL built from the request host', () => {
    const out = resolveMedia('{"downloadUrl":"{{$media \'clip\'}}"}', '192.168.0.12:4650', lookup);
    expect(out).toBe('{"downloadUrl":"http://192.168.0.12:4650/__mocka/media/abc-123.mp4"}');
  });

  it('uses whichever host the request arrived on, so simulator and device both resolve', () => {
    const template = "{{$media 'clip'}}";
    expect(resolveMedia(template, 'localhost:4650', lookup)).toContain('http://localhost:4650/');
    expect(resolveMedia(template, '10.0.1.7:4650', lookup)).toContain('http://10.0.1.7:4650/');
  });

  it('leaves an unknown name in place and reports it, rather than blanking it', () => {
    const onMissing = vi.fn();
    const out = resolveMedia("{{$media 'typo'}}", 'localhost:4650', lookup, onMissing);
    expect(out).toBe("{{$media 'typo'}}");
    expect(onMissing).toHaveBeenCalledWith('typo');
  });

  it('replaces every occurrence and accepts double quotes', () => {
    const out = resolveMedia('{{$media \'clip\'}}|{{$media "clip"}}', 'h:1', lookup);
    expect(out).toBe('http://h:1/__mocka/media/abc-123.mp4|http://h:1/__mocka/media/abc-123.mp4');
  });

  it('returns the template untouched when the request carried no Host header', () => {
    expect(resolveMedia("{{$media 'clip'}}", undefined, lookup)).toBe("{{$media 'clip'}}");
  });

  it('builds URLs under the prefix the mock server serves', () => {
    expect(buildMediaUrl('h:1', 'x.mp4')).toBe(`http://h:1${MEDIA_URL_PREFIX}x.mp4`);
  });
});
