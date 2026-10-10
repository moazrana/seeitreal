import {
  guidanceOptions,
  parseIssues,
  resolveIssues,
  serializeIssues,
} from './regeneration-guidance';

describe('regeneration guidance', () => {
  it('uses ticked issues as given, ignoring the note', () => {
    expect(resolveIssues('colors are off', ['shape'])).toEqual(['shape']);
  });

  it('infers issues from English and Roman Urdu keywords when none are ticked', () => {
    expect(resolveIssues('Bun is too orange and blurry')).toEqual([
      'colors',
      'detail',
    ]);
    expect(resolveIssues('rang theek nahi')).toEqual(['colors']);
    expect(resolveIssues('shape is distorted')).toEqual(['shape']);
    expect(resolveIssues('looks fine to me')).toEqual([]);
    expect(resolveIssues(null)).toEqual([]);
  });

  it('round-trips issues through the stored comma list, dropping unknowns', () => {
    expect(serializeIssues(['colors', 'detail'])).toBe('colors,detail');
    expect(serializeIssues([])).toBeNull();
    expect(parseIssues('detail,bogus,colors')).toEqual(['colors', 'detail']);
    expect(parseIssues(null)).toEqual([]);
  });

  it('always uses fresh seeds so a regeneration differs from the last model', () => {
    const a = guidanceOptions([]);
    const b = guidanceOptions([]);
    expect(a.modelSeed).toEqual(expect.any(Number));
    expect(a.textureSeed).toEqual(expect.any(Number));
    expect([a.modelSeed, a.textureSeed]).not.toEqual([
      b.modelSeed,
      b.textureSeed,
    ]);
    expect(a).not.toHaveProperty('pbr');
  });

  it('maps wrong colors to PBR, detailed texture and photo-aligned texture', () => {
    expect(guidanceOptions(['colors'])).toMatchObject({
      pbr: true,
      textureQuality: 'detailed',
      textureAlignment: 'original_image',
    });
    expect(guidanceOptions(['detail'])).toMatchObject({
      textureQuality: 'detailed',
    });
  });
});
