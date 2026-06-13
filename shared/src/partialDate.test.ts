import { describe, expect, it } from 'vitest';
import {
  ageAt,
  comparePartialDates,
  daysBetween,
  formatPartialDate,
  formatPartialDateInput,
  nextBirthday,
  parsePartialDate,
  parsePartialDateInput,
} from './partialDate';

describe('parsePartialDate', () => {
  it('parsira sva tri oblika', () => {
    expect(parsePartialDate('1956')).toEqual({ year: 1956 });
    expect(parsePartialDate('1956-03')).toEqual({ year: 1956, month: 3 });
    expect(parsePartialDate('1956-03-15')).toEqual({ year: 1956, month: 3, day: 15 });
  });

  it('prihvata 29. februar samo u prestupnoj godini', () => {
    expect(parsePartialDate('2000-02-29')).toEqual({ year: 2000, month: 2, day: 29 });
    expect(parsePartialDate('2004-02-29')).toEqual({ year: 2004, month: 2, day: 29 });
    expect(parsePartialDate('2001-02-29')).toBeNull();
    expect(parsePartialDate('1900-02-29')).toBeNull(); // 1900 nije prestupna (deljiva sa 100)
  });

  it('odbija nevalidne vrednosti', () => {
    expect(parsePartialDate('1956-13')).toBeNull();
    expect(parsePartialDate('1956-00')).toBeNull();
    expect(parsePartialDate('1956-02-30')).toBeNull();
    expect(parsePartialDate('1956-04-31')).toBeNull();
    expect(parsePartialDate('29.2.2001')).toBeNull();
    expect(parsePartialDate('1956-3')).toBeNull();
    expect(parsePartialDate('')).toBeNull();
    expect(parsePartialDate('abcd')).toBeNull();
  });

  it('null/undefined → null', () => {
    expect(parsePartialDate(null)).toBeNull();
    expect(parsePartialDate(undefined)).toBeNull();
  });
});

describe('comparePartialDates', () => {
  it('hronološki poredak', () => {
    expect(comparePartialDates('1955', '1956')).toBeLessThan(0);
    expect(comparePartialDates('1956-02', '1956-01')).toBeGreaterThan(0);
    expect(comparePartialDates('1956-01-02', '1956-01-03')).toBeLessThan(0);
    expect(comparePartialDates('1956-01-03', '1956-01-03')).toBe(0);
  });

  it('null i nevalidne vrednosti idu poslednje', () => {
    expect(comparePartialDates('1956', null)).toBeLessThan(0);
    expect(comparePartialDates(null, '1956')).toBeGreaterThan(0);
    expect(comparePartialDates(null, null)).toBe(0);
    expect(comparePartialDates('nije-datum', '1956')).toBeGreaterThan(0);
  });

  it('pri izjednačenju kraći (manje precizan) ide prvi', () => {
    expect(comparePartialDates('1956', '1956-01-01')).toBeLessThan(0);
    expect(comparePartialDates('1956-01', '1956-01-01')).toBeLessThan(0);
    expect(comparePartialDates('1956-01-01', '1956')).toBeGreaterThan(0);
  });

  it('sortira niz hronološki sa null na kraju', () => {
    const input = ['1956-05', null, '1956', '1955-12-31'];
    expect([...input].sort(comparePartialDates)).toEqual(['1955-12-31', '1956', '1956-05', null]);
  });
});

describe('formatPartialDate', () => {
  it('formatira sva tri oblika za sr-Latn', () => {
    expect(formatPartialDate('1956-03-15')).toBe('15.03.1956.');
    expect(formatPartialDate('1956-03')).toBe('mart 1956.');
    expect(formatPartialDate('1956')).toBe('1956.');
  });

  it('prazan string za null/nevalidan ulaz', () => {
    expect(formatPartialDate(null)).toBe('');
    expect(formatPartialDate('1956-13')).toBe('');
  });
});

describe('parsePartialDateInput', () => {
  it('parsira evropski format u parcijalni ISO', () => {
    expect(parsePartialDateInput('15.03.1956')).toBe('1956-03-15');
    expect(parsePartialDateInput('03.1956')).toBe('1956-03');
    expect(parsePartialDateInput('1956')).toBe('1956');
  });

  it('toleriše jednocifren dan/mesec i završnu tačku', () => {
    expect(parsePartialDateInput('5.3.1956')).toBe('1956-03-05');
    expect(parsePartialDateInput('15.03.1956.')).toBe('1956-03-15');
  });

  it('null za prazan ili nevalidan unos', () => {
    expect(parsePartialDateInput('')).toBeNull();
    expect(parsePartialDateInput(null)).toBeNull();
    expect(parsePartialDateInput('1956-03-15')).toBeNull(); // ISO nije ulazni format
    expect(parsePartialDateInput('29.02.2001')).toBeNull(); // nepostojeći datum
    expect(parsePartialDateInput('32.01.2000')).toBeNull();
    expect(parsePartialDateInput('abcd')).toBeNull();
  });
});

describe('formatPartialDateInput', () => {
  it('ISO → uredljiv evropski tekst (bez završne tačke)', () => {
    expect(formatPartialDateInput('1956-03-15')).toBe('15.03.1956');
    expect(formatPartialDateInput('1956-03')).toBe('03.1956');
    expect(formatPartialDateInput('1956')).toBe('1956');
  });

  it('prazan string za null/nevalidan ulaz', () => {
    expect(formatPartialDateInput(null)).toBe('');
    expect(formatPartialDateInput('1956-13')).toBe('');
  });
});

describe('ageAt', () => {
  it('pun datum rođenja: pre, na dan i posle rođendana', () => {
    expect(ageAt('1990-06-15', '2020-06-14')).toBe(29);
    expect(ageAt('1990-06-15', '2020-06-15')).toBe(30);
    expect(ageAt('1990-06-15', '2020-06-16')).toBe(30);
  });

  it('radi i sa Date referencom', () => {
    expect(ageAt('1990-06-15', new Date(2020, 5, 15))).toBe(30);
    expect(ageAt('1990-06-15', new Date(2020, 5, 14))).toBe(29);
  });

  it('parcijalan datum rođenja se tretira kao 1. januar / 1. u mesecu', () => {
    expect(ageAt('1990', '2020-01-01')).toBe(30);
    expect(ageAt('1990', '2019-12-31')).toBe(29);
    expect(ageAt('1990-06', '2020-05-31')).toBe(29);
    expect(ageAt('1990-06', '2020-06-01')).toBe(30);
  });

  it('null za neparsiv datum rođenja', () => {
    expect(ageAt(null)).toBeNull();
    expect(ageAt('nije-datum')).toBeNull();
  });
});

describe('nextBirthday', () => {
  it('rođendan kasnije ove godine', () => {
    expect(nextBirthday('1990-06-15', new Date(2026, 5, 1))).toEqual(new Date(2026, 5, 15));
  });

  it('rođendan danas → danas (i pored doba dana)', () => {
    expect(nextBirthday('1990-06-15', new Date(2026, 5, 15, 14, 30))).toEqual(new Date(2026, 5, 15));
  });

  it('rođendan prošao → sledeća godina', () => {
    expect(nextBirthday('1990-06-15', new Date(2026, 5, 16))).toEqual(new Date(2027, 5, 15));
  });

  it('29. februar → 28. februar u neprestupnoj godini', () => {
    expect(nextBirthday('1992-02-29', new Date(2026, 0, 10))).toEqual(new Date(2026, 1, 28));
    expect(nextBirthday('1992-02-29', new Date(2026, 2, 1))).toEqual(new Date(2027, 1, 28));
  });

  it('29. februar ostaje 29. u prestupnoj godini', () => {
    expect(nextBirthday('1992-02-29', new Date(2028, 0, 1))).toEqual(new Date(2028, 1, 29));
  });

  it('parcijalni datumi ne generišu podsetnik', () => {
    expect(nextBirthday('1990-06', new Date(2026, 0, 1))).toBeNull();
    expect(nextBirthday('1990', new Date(2026, 0, 1))).toBeNull();
    expect(nextBirthday(null)).toBeNull();
  });
});

describe('daysBetween', () => {
  it('preko prelaza na letnje vreme: 28.3.2026 → 31.3.2026 = 3 dana', () => {
    // u Evropi se 29.3.2026 prelazi na letnje vreme — razlika mora ostati u celim danima
    expect(daysBetween(new Date(2026, 2, 28), new Date(2026, 2, 31))).toBe(3);
  });

  it('isti dan = 0, obrnut redosled = negativno', () => {
    expect(daysBetween(new Date(2026, 5, 12), new Date(2026, 5, 12))).toBe(0);
    expect(daysBetween(new Date(2026, 5, 12), new Date(2026, 5, 9))).toBe(-3);
  });

  it('ignoriše doba dana (ponoć-do-ponoć)', () => {
    expect(daysBetween(new Date(2026, 5, 12, 23, 59), new Date(2026, 5, 13, 0, 1))).toBe(1);
  });
});
