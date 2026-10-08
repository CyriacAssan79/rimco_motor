import { z } from 'zod';

export const briefSchema = z.object({
  vehicle_asset_id: z.string().min(1),
  vehicle_description: z.string().trim().min(1).max(500),
  location: z.string().trim().max(160).default(''),
  setting: z.string().trim().max(160).default(''),
  character: z.string().trim().max(160).default(''),
  lighting: z.string().trim().max(160).default('golden hour'),
  camera_movement: z.string().trim().max(160).default('slow tracking shot'),
  mood: z.string().trim().max(160).default('confident'),
  format: z.enum(['16:9', '9:16', '1:1', '4:5']).default('16:9'),
  duration_s: z.literal(5).default(5),
});
export type Brief = z.infer<typeof briefSchema>;
export const briefOptionsSchema = briefSchema.omit({ vehicle_asset_id: true, vehicle_description: true }).partial();

/** Fields the language model may propose; asset identity and duration stay server-owned. */
export const generatedBriefFieldsSchema = z.object({
  location: z.string().trim().max(160),
  setting: z.string().trim().max(160),
  character: z.string().trim().max(160),
  lighting: z.string().trim().max(160),
  camera_movement: z.string().trim().max(160),
  mood: z.string().trim().max(160),
  format: z.enum(['16:9', '9:16', '1:1', '4:5']),
}).strict();
export function buildBrief(description: string, options: Partial<Brief> & { vehicle_asset_id?: string }): Brief {
  return briefSchema.parse({ vehicle_asset_id: options.vehicle_asset_id ?? 'mock-vehicle', vehicle_description: description, ...options });
}

export function briefToPrompt(brief: Brief, family: string): string {
  const cameraGuidance = family === 'veo'
    ? 'Use a single continuous take and avoid introducing unrequested objects.'
    : family === 'wan' ? 'Favor smooth restrained motion and strong consistency with the reference image.' : 'Use one controlled camera move with no scene cut.';
  return `Create a ${brief.duration_s}-second ${brief.format} image-to-video commercial. Keep the vehicle exactly faithful to the provided reference photo: ${brief.vehicle_description}. Location: ${brief.location || brief.setting || 'modern urban architecture'}. Character: ${brief.character || 'none'}. Lighting: soft early morning or late afternoon ${brief.lighting}. Camera: ${brief.camera_movement}. Mood: ${brief.mood}. Use a simple composition, natural people, and about 90% blue and 10% red tones. ${cameraGuidance} Do not alter the vehicle identity, model, proportions, or paint.`;
}
