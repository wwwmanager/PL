
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
  waybills: z.array(z.any()).optional(),
  vehicles: z.array(z.any()).optional(),
  employees: z.array(z.any()).optional(),
  organizations: z.array(z.any()).optional(),
  fuelTypes: z.array(z.any()).optional(),
  savedRoutes: z.array(z.any()).optional(),
  users: z.array(z.any()).optional(),
  // Add other keys as needed for validation
}).passthrough();
