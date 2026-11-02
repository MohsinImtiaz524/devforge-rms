const { z } = require('zod');
const key = z.string().regex(/^[a-z][a-z0-9_-]{0,59}$/);
const version = z.number().int().nonnegative();
const metadata = z.object({
  name: z.string().trim().min(2).max(100),
  summary: z.string().trim().min(5).max(240),
  description: z.string().trim().max(10000),
  category: z.enum(['people','insights','web','other']),
  sort_order: z.number().int().min(0).max(10000),
  icon_ids: z.array(z.string().uuid()).max(1).optional(),
  cover_ids: z.array(z.string().uuid()).max(1).optional(),
  screenshot_ids: z.array(z.string().uuid()).max(6).optional(),
  version,
}).strict();
const price = z.object({ version, currency: z.enum(['PKR','USD','EUR','GBP','AED','SAR']), monthly_amount_minor: z.number().int().min(0).max(100000000) }).strict();
const status = z.object({ version, status: z.enum(['draft','published','archived']) }).strict();
module.exports = { key, metadata, price, status };
