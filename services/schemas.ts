
import { z } from 'zod';

export const organizationStatusSchema = z.enum(['Active', 'Archived', 'Liquidated']);

export const BlankFiltersSchema = z.object({
  series: z.string().optional(),
  number: z.string().optional(),
  status: z.string().optional(),
  ownerName: z.string().optional(),
  usedInWaybillId: z.string().optional(),
});

// Partial schema for DB validation (lenient)
export const databaseSchema = z.object({
  waybills: z.array(z.any()).nullable().optional(),
  vehicles: z.array(z.any()).nullable().optional(),
  employees: z.array(z.any()).nullable().optional(),
  organizations: z.array(z.any()).nullable().optional(),
  fuelTypes: z.array(z.any()).nullable().optional(),
  savedRoutes: z.array(z.any()).nullable().optional(),
  users: z.array(z.any()).nullable().optional(),
  // Add other keys as needed for validation
}).passthrough();
