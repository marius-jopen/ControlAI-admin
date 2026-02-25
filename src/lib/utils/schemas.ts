/**
 * Shared Zod validation schemas for admin panel form validation.
 */
import { z } from 'zod';

// Auth
export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required')
});

// App management
export const createAppSchema = z.object({
  id: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, 'App ID must be lowercase alphanumeric with hyphens'),
  name: z.string().min(1, 'App name is required'),
  config: z.object({}).passthrough()
});

export const updateAppSchema = z.object({
  name: z.string().min(1).optional(),
  config: z.object({}).passthrough().optional(),
  credit_mode: z.enum(['individual', 'pool', 'pool_capped']).optional(),
  credit_pool: z.number().int().min(0).optional(),
  pool_user_cap: z.number().int().min(0).nullable().optional(),
  pool_user_cap_period: z.enum(['daily', 'weekly', 'monthly']).optional()
});

// LoRA management
export const createLoraSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  value: z.string().min(1, 'Model identifier is required'),
  trigger: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  type: z.enum(['sdxl', 'flux'], { errorMap: () => ({ message: 'Type must be sdxl or flux' }) })
});

export const updateLoraSchema = z.object({
  name: z.string().min(1).optional(),
  value: z.string().min(1).optional(),
  trigger: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  type: z.enum(['sdxl', 'flux']).optional()
});

// Pricing management
export const createPricingSchema = z.object({
  provider: z.string().min(1, 'Provider is required'),
  model: z.string().min(1, 'Model is required'),
  display_name: z.string().nullable().optional(),
  unit: z.string().min(1, 'Unit is required'),
  cost_per_unit_usd: z.number().min(0).default(0),
  markup_multiplier: z.number().min(0).default(2.5),
  fixed_credit_override: z.number().int().nullable().optional(),
  is_active: z.boolean().default(true),
  notes: z.string().nullable().optional()
});

// Credit adjustment
export const adjustCreditsSchema = z.object({
  app_id: z.string().min(1, 'App ID is required'),
  amount: z.number().int().refine(v => v !== 0, 'Amount must be non-zero'),
  target: z.enum(['main', 'bonus', 'pool_cap']).default('main'),
  notes: z.string().default('')
});

// Type exports
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateAppInput = z.infer<typeof createAppSchema>;
export type UpdateAppInput = z.infer<typeof updateAppSchema>;
export type CreateLoraInput = z.infer<typeof createLoraSchema>;
export type UpdateLoraInput = z.infer<typeof updateLoraSchema>;
export type CreatePricingInput = z.infer<typeof createPricingSchema>;
export type AdjustCreditsInput = z.infer<typeof adjustCreditsSchema>;
