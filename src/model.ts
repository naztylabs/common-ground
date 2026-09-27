import { z } from 'zod';
export const relativePath = z.string().min(1).refine(p => !p.startsWith('/') && !p.includes('\\') && !p.split('/').some(s => s === '..' || s === '.' || s === '') && !/^[A-Za-z]:/.test(p), 'Use a repository-relative path without traversal');
export const Evidence = z.object({ path: relativePath, quote: z.string().trim().min(1).max(1200) }).strict();
export const Fact = z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/), statement: z.string().trim().min(8).max(320), evidence: z.array(Evidence).min(1).max(8) }).strict();
export const PillarDefinition = z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/), title: z.string().trim().min(3).max(100), scope: z.string().trim().min(12).max(800), excludes: z.string().trim().min(3).max(800), paths: z.array(relativePath).min(1).max(30) }).strict();
export const Pillar = PillarDefinition.extend({ revision: z.number().int().positive(), facts: z.array(Fact).max(50), sources: z.record(z.string()) }).strict();
export const Registry = z.object({ schemaVersion: z.literal(1), pillars: z.array(Pillar) }).strict();
export const Update = z.object({ pillarId: z.string(), expectedRevision: z.number().int().positive(), touchedPaths: z.array(relativePath).min(1), invalidatedFactIds: z.array(z.string()), reviewedFactIds: z.array(z.string()), facts: z.array(Fact).max(50), reason: z.string().trim().min(12).max(1000) }).strict();
export type Definition = z.infer<typeof PillarDefinition>;
export type PillarRecord = z.infer<typeof Pillar>;
export type RegistryRecord = z.infer<typeof Registry>;
export type UpdateRequest = z.infer<typeof Update>;
export function unique(values: string[], label: string) { if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label}`); }
