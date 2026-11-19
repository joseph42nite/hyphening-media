import { describe, it, expect } from 'vitest';
import { ruleProblems, repeatedName, headChanges, readVerdict } from '../../scripts/lib/fixReview.mjs';

const page = (title, description = 'A description.') => ({ title, description });

describe('night fix review rules', () => {
  it('catches the 18 Nov dermatologist fixes', () => {
    const before = { 'index.html': page('Dermatologist in Whitefield, Bangalore | Dr. Divya Sharma'),
      'book-an-appointment.html': page('Book an Appointment | Dr. Divya Sharma Dermatologist Bangalore') };
    const after = { 'index.html': page('Best Dermatologist in Whitefield, Bangalore | Dr. Divya Sharma, MD (Skin) – 18 Yrs'),
      'book-an-appointment.html': page('Book an Appointment Online | Dr. Divya Sharma Clinic, Whitefield | Dr. Divya Sharma Dermatology') };
    const diff = [
      '-    default: "Dermatologist in Whitefield, Bangalore | Dr. Divya Sharma",',
      '+    default: "Best Dermatologist in Whitefield, Bangalore | Dr. Divya Sharma, MD (Skin) – 18 Yrs",',
      '+  description: "... US-FDA cleared lasers for acne ...",',
    ].join('\n');
    const problems = ruleProblems({ diff, changes: headChanges(before, after), healthcare: true });
    expect(problems.join('\n')).toMatch(/index.html: the title is 82 characters/);
    expect(problems.join('\n')).toMatch(/book-an-appointment.html: the title names "dr divya sharma" twice/);
    expect(problems.join('\n')).toMatch(/adds "Best"/);
    expect(problems.join('\n')).toMatch(/adds "FDA"/);
  });

  it('lets a plain, short title change through', () => {
    const changes = headChanges({ 'a.html': page('Acne | Dr. X') }, { 'a.html': page('Acne Treatment in Whitefield | Dr. X') });
    expect(ruleProblems({ diff: '+  title: "Acne Treatment in Whitefield"', changes, healthcare: true })).toEqual([]);
  });

  it('does not blame a fix for a long title or a claim that was already there', () => {
    const long = 'x'.repeat(80);
    const changes = headChanges({ 'a.html': page(long) }, { 'a.html': page(long.slice(0, 70)) });
    expect(ruleProblems({ diff: '- best clinic old\n+ best clinic new', changes, healthcare: false })).toEqual([]);
  });

  it('finds a repeated name only across title parts', () => {
    expect(repeatedName('Acne | Dr. Divya Sharma')).toBeNull();
    expect(repeatedName('Dr. Divya Sharma Clinic – Dr. Divya Sharma')).toBe('dr divya sharma');
  });

  it('holds on anything but a clear pass', () => {
    expect(readVerdict({ verdict: 'pass', reason: 'ok' }).pass).toBe(true);
    expect(readVerdict({ verdict: 'hold', reason: 'no' }).pass).toBe(false);
    expect(readVerdict(null, 'timed out').pass).toBe(false);
  });
});
