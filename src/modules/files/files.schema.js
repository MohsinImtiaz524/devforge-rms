const { z } = require('zod');
const id=z.string().uuid();
const upload=z.object({purpose:z.string().max(80),filename:z.string().trim().min(1).max(255).refine(s=>!/[\x00-\x1f\x7f/\\]/.test(s),'Invalid filename'),contentType:z.enum(['image/jpeg','image/png','image/webp','image/gif']),size:z.number().int().positive().max(10*1024*1024),idempotencyKey:id}).strict();
module.exports={id,upload};
