import { z } from 'zod';
import type { Gender, ParentRole, ProposalStatus, UnionEndReason, UnionType } from './types';

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

// --- Predlozi saradnika (pozivni link → pregled → spajanje u stablo) ---

/** Dozvoljeni rokovi važenja pozivnog linka (u danima) — link bez isteka ne postoji. */
export const PROPOSAL_TOKEN_DAYS = [7, 30, 90] as const;

/** Gornje granice jednog predloga — javna ruta ne sme da primi proizvoljno velik paket. */
export const PROPOSAL_LIMITS = { persons: 50, unions: 50, parentLinks: 50 } as const;

export const proposalStatusSchema: z.ZodType<ProposalStatus> = z.enum(['pending', 'approved', 'rejected']);
export const parentRoleSchema: z.ZodType<ParentRole> = z.enum(['father', 'mother']);

/** POST /api/proposals/manage/tokens */
export const createProposalTokenSchema = z.object({
  label: z.string().trim().min(1, 'Naziv je obavezan').max(100),
  expires_in_days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
});

const tempIdSchema = z.string().trim().min(1).max(50);
/** Broj = postojeća osoba iz stabla; string = temp_id nove osobe iz istog predloga. */
const personRefSchema = z.union([z.number().int().positive(), tempIdSchema]);
const optionalPersonRef = z.preprocess(emptyToNull, personRefSchema.nullable());

/** Podaci nove osobe bez roditeljskih veza — forma saradnika i osnova za proposedPersonSchema. */
export const proposedPersonFieldsSchema = personObject.omit({ father_id: true, mother_id: true });

export const proposedPersonSchema = proposedPersonFieldsSchema.extend({
  temp_id: tempIdSchema,
  father_id: optionalPersonRef,
  mother_id: optionalPersonRef,
});

export const proposedUnionSchema = unionObject
  .extend({ partner1_id: personRefSchema, partner2_id: personRefSchema })
  .refine((u) => u.partner1_id !== u.partner2_id, {
    message: 'Osoba ne može biti u braku sama sa sobom',
  });

/** Nova osoba (parent_id = temp_id) postaje otac/majka postojeće osobe. */
export const proposedParentLinkSchema = z.object({
  child_id: z.number().int().positive(),
  parent_id: tempIdSchema,
  role: parentRoleSchema,
});

/** POST /api/proposals/public/tokens/:token/submit */
export const submitProposalSchema = z.object({
  author_name: z.string().trim().min(1, 'Unesite vaše ime i prezime').max(100),
  notes: optionalText(2000),
  persons: z
    .array(proposedPersonSchema)
    .min(1, 'Predlog mora sadržati bar jednu novu osobu')
    .max(PROPOSAL_LIMITS.persons, `Jedan predlog može imati najviše ${PROPOSAL_LIMITS.persons} osoba`),
  unions: z.array(proposedUnionSchema).max(PROPOSAL_LIMITS.unions).default([]),
  parent_links: z.array(proposedParentLinkSchema).max(PROPOSAL_LIMITS.parentLinks).default([]),
});

/** Autor i poruka — forma za slanje predloga na klijentu. */
export const proposalAuthorSchema = submitProposalSchema.pick({ author_name: true, notes: true });

/** GET /api/proposals?status= */
export const proposalListQuerySchema = z.object({ status: proposalStatusSchema.optional() });

/** POST /api/proposals/:id/approve — merges: nove osobe koje su zapravo postojeće (rešen duplikat). */
export const approveProposalSchema = z.object({
  merges: z
    .array(z.object({ temp_id: tempIdSchema, person_id: z.number().int().positive() }))
    .max(PROPOSAL_LIMITS.persons)
    .default([]),
});

/** POST /api/proposals/:id/reject */
export const rejectProposalSchema = z.object({
  review_notes: optionalText(2000),
});

export type CreateProposalTokenInput = z.infer<typeof createProposalTokenSchema>;
export type ProposedPersonFields = z.infer<typeof proposedPersonFieldsSchema>;
export type SubmitProposalInput = z.infer<typeof submitProposalSchema>;
export type ProposalAuthorInput = z.infer<typeof proposalAuthorSchema>;
export type ApproveProposalInput = z.infer<typeof approveProposalSchema>;
export type RejectProposalInput = z.infer<typeof rejectProposalSchema>;
