import { z } from 'zod';
export const requestSchema = z.object({
  description: z.string().trim().min(5).max(500),
  assetId: z.string().min(1),
  audioAssetId: z.string().min(1).nullable().optional(),
  location: z.string().max(160).default(''),
  setting: z.string().max(160).default(''),
  character: z.string().max(160).default(''),
  lighting: z.string().max(160).default('golden hour'),
  format: z.enum(['16:9','9:16','1:1','4:5']).default('16:9'),
  tier: z.enum(['standard','premium','test']).default('standard'),
});
