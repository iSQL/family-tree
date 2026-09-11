import { z } from 'zod';
import type { Gender, UnionEndReason, UnionType } from './types';

/** 'YYYY' | 'YYYY-MM' | 'YYYY-MM-DD' */
export const partialDateRegex = /^\d{4}(-\d{2}(-\d{2})?)?$/;

function isRealPartialDate(value: string): boolean {
  const parts = value.split('-').map(Number);
  const year = parts[0]!;
  const month = parts[1];
  const day = parts[2];
  if (month !== undefined && (month < 1 || month > 12)) return false;
  if (day !== undefined) {
    const daysInMonth = new Date(Date.UTC(year, month!, 0)).getUTCDate();
    if (day < 1 || day > daysInMonth) return false;
  }
  return true;
}

export const partialDateSchema = z
  .string()
  .regex(partialDateRegex, 'Datum mora biti u formatu DD.MM.GGGG, MM.GGGG ili GGGG')
  .refine(isRealPartialDate, 'Nepostojeći datum');

/** '' | undefined | null → null; inače validira unutrašnju šemu. U .partial() šemama
 *  nedostajući ključ ostaje undefined (ZodOptional preskače preprocess). */
const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : (v ?? null));

const optionalText = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable());
const optionalPartialDate = z.preprocess(emptyToNull, partialDateSchema.nullable());
const optionalPersonId = z.preprocess(emptyToNull, z.number().int().positive().nullable());

export const genderSchema: z.ZodType<Gender> = z.enum(['M', 'F', 'U']);
export const unionTypeSchema: z.ZodType<UnionType> = z.enum(['marriage', 'partnership']);
export const unionEndReasonSchema: z.ZodType<UnionEndReason> = z.enum(['divorce', 'death', 'separation']);

const personObject = z.object({
  first_name: z.string().trim().min(1, 'Ime je obavezno').max(100),
  last_name: z.string().trim().max(100).default(''),
  maiden_name: optionalText(100),
  gender: genderSchema.default('U'),
  title: optionalText(50),
  birth_date: optionalPartialDate,
  death_date: optionalPartialDate,
  birth_place: optionalText(200),
  notes: optionalText(10_000),
  father_id: optionalPersonId,
  mother_id: optionalPersonId,
});

/** POST /api/persons */
export const personInputSchema = personObject;
/** PATCH /api/persons/:id — nedostajući ključevi se NE diraju; eksplicitni null/'' briše vrednost. */
export const personPatchSchema = personObject.partial().extend({
  // Označavanje glave porodice — samo kroz PATCH (kreiranje uvek kreće sa false).
  is_family_head: z.boolean().optional(),
});

const unionObject = z.object({
  partner1_id: z.number().int().positive(),
  partner2_id: z.number().int().positive(),
  type: unionTypeSchema.default('marriage'),
  start_date: optionalPartialDate,
  end_date: optionalPartialDate,
  end_reason: z.preprocess(emptyToNull, unionEndReasonSchema.nullable()),
  notes: optionalText(10_000),
});

/** POST /api/unions — server kanonizuje redosled partnera (partner1_id < partner2_id). */
export const unionInputSchema = unionObject.refine((u) => u.partner1_id !== u.partner2_id, {
  message: 'Osoba ne može biti u braku sama sa sobom',
});
/** PATCH /api/unions/:id — partneri se ne menjaju (obriši pa napravi novi union). */
export const unionPatchSchema = unionObject.omit({ partner1_id: true, partner2_id: true }).partial();

export const loginSchema = z.object({
  password: z.string().min(1, 'Lozinka je obavezna'),
});

export type PersonInput = z.infer<typeof personInputSchema>;
export type PersonPatch = z.infer<typeof personPatchSchema>;
export type UnionInput = z.infer<typeof unionInputSchema>;
export type UnionPatch = z.infer<typeof unionPatchSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

// --- Predlozi rođaka (pozivni link → grana izmena → pregled i spajanje) ---

/** Dozvoljeni rokovi važenja pozivnog linka (u danima) — link bez isteka ne postoji. */
export const PROPOSAL_TOKEN_DAYS = [7, 30, 90] as const;

/** POST /api/proposals/manage/tokens */
export const createProposalTokenSchema = z.object({
  label: z.string().trim().min(1, 'Naziv je obavezan').max(100),
  expires_in_days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
});

/** POST /api/proposals/public/tokens/:token/enter — ime se beleži uz svaku izmenu u grani. */
export const enterBranchSchema = z.object({
  author_name: z.string().trim().min(1, 'Unesite vaše ime i prezime').max(100),
});

/** POST /api/proposals/branch/submit */
export const submitBranchSchema = z.object({
  note: optionalText(2000),
});

/** Izabrane izmene za spajanje ili odbacivanje ('person:12', 'union:3'). */
export const branchChangeKeysSchema = z.object({
  keys: z
    .array(z.string().regex(/^(person|union):\d+$/, 'Neispravan ključ izmene'))
    .min(1, 'Izaberite bar jednu izmenu')
    .max(5000),
});

export type CreateProposalTokenInput = z.infer<typeof createProposalTokenSchema>;
export type EnterBranchInput = z.infer<typeof enterBranchSchema>;
export type SubmitBranchInput = z.infer<typeof submitBranchSchema>;
export type BranchChangeKeysInput = z.infer<typeof branchChangeKeysSchema>;
