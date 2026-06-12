import { describe, expect, it } from 'vitest';
import { foldForSearch, personMatchesQuery } from './search';

describe('foldForSearch', () => {
  it('ćirilica, latinica sa dijakritikom i gola latinica daju isti fold', () => {
    expect(foldForSearch('Ђорђевић')).toBe('djordjevic');
    expect(foldForSearch('Đorđević')).toBe('djordjevic');
    expect(foldForSearch('djordjevic')).toBe('djordjevic');
  });

  it('ćirilični digrafi: љ → lj, џ → dz', () => {
    expect(foldForSearch('Љиљана')).toBe('ljiljana');
    expect(foldForSearch('Џемал')).toBe('dzemal');
  });

  it('skida š/č/ć/ž i ostalu dijakritiku', () => {
    expect(foldForSearch('Žarko Šušnjić')).toBe('zarko susnjic');
    expect(foldForSearch('ČĆŠŽĐ')).toBe('ccszdj');
  });

  it('sažima razmake i radi trim', () => {
    expect(foldForSearch('  Marko   Marković  ')).toBe('marko markovic');
  });
});

describe('personMatchesQuery', () => {
  const marko = { first_name: 'Марко', last_name: 'Ђорђевић', maiden_name: null };
  const ana = { first_name: 'Ana', last_name: 'Јовановић', maiden_name: 'Петровић' };

  it('nalazi ćirilično ime preko latiničnog upita (i obrnuto)', () => {
    expect(personMatchesQuery(marko, 'djordj')).toBe(true);
    expect(personMatchesQuery(marko, 'Đorđević')).toBe(true);
    expect(personMatchesQuery(marko, 'Ђорђевић')).toBe(true);
  });

  it('upit od više reči: svaka reč mora da pogodi', () => {
    expect(personMatchesQuery(marko, 'marko djordjevic')).toBe(true);
    expect(personMatchesQuery(marko, 'đorđ marko')).toBe(true); // redosled nebitan
    expect(personMatchesQuery(marko, 'marko petrovic')).toBe(false);
  });

  it('pretražuje i devojačko prezime', () => {
    expect(personMatchesQuery(ana, 'petrovic')).toBe(true);
    expect(personMatchesQuery(ana, 'ana petrović')).toBe(true);
    expect(personMatchesQuery(ana, 'jovanovic')).toBe(true);
  });

  it('prazan upit ili samo razmaci → false', () => {
    expect(personMatchesQuery(marko, '')).toBe(false);
    expect(personMatchesQuery(marko, '   ')).toBe(false);
  });
});
