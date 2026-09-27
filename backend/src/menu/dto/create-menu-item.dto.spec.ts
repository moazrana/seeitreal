import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMenuItemDto } from './create-menu-item.dto';

async function errorsFor(input: Record<string, unknown>) {
  const errors = await validate(plainToInstance(CreateMenuItemDto, input));
  return errors.map((e) => e.property);
}

describe('CreateMenuItemDto dimensions (documents/TASK-real-world-ar-sizing.md §2)', () => {
  it('accepts realistic dish sizes', async () => {
    expect(
      await errorsFor({
        name: 'Karahi',
        widthMm: 260,
        heightMm: 90,
        lengthMm: 260,
      }),
    ).toEqual([]);
  });

  it.each(['widthMm', 'heightMm', 'lengthMm'])(
    'rejects a sub-centimetre %s (a cm/inch value typed as mm — the staging 5mm karahi)',
    async (field) => {
      expect(await errorsFor({ name: 'Karahi', [field]: 5 })).toEqual([field]);
    },
  );

  it('rejects non-integer millimetres and anything over 20 inches (508mm)', async () => {
    expect(await errorsFor({ name: 'Karahi', widthMm: 26.5 })).toEqual([
      'widthMm',
    ]);
    expect(await errorsFor({ name: 'Karahi', widthMm: 509 })).toEqual([
      'widthMm',
    ]);
    expect(await errorsFor({ name: 'Karahi', widthMm: 508 })).toEqual([]);
  });
});

describe('name trimming', () => {
  it('trims surrounding whitespace and rejects whitespace-only names', async () => {
    const dto = plainToInstance(CreateMenuItemDto, { name: '  Karahi  ' });
    expect(dto.name).toBe('Karahi');
    expect(await errorsFor({ name: '   ' })).toEqual(['name']);
  });
});
