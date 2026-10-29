const { z } = require('zod');
const reason = z.string().trim().min(3).max(1000);
const archiveInput = z.object({
  entity: z.enum(['ingredient', 'product', 'variant']),
  entityId: z.coerce.number().int().positive(),
  kind: z.enum(['item', 'quantity']),
  quantity: z.number().finite().positive().max(1e12).optional(),
  reason,
  requestId: z.uuid(),
}).strict().superRefine((value, ctx) => {
  if (value.kind === 'quantity' && (!value.quantity || Math.abs(value.quantity * 1000 - Math.round(value.quantity * 1000)) > 0.00001)) {
    ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'Enter a quantity greater than zero with at most 3 decimal places.' });
  }
});
const restoreInput = z.object({ reason }).strict();
module.exports = { archiveInput, restoreInput };
