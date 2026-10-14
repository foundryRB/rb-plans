import { defineCollection, z } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';

// The fleet's doc frontmatter (id, type, status, summary, updated) rides on
// the Starlight schema; type: is what the app-contract check reads
// (INT-FOUNDRY-010).
export const collections = {
    docs: defineCollection({
        loader: docsLoader(),
        schema: docsSchema({
            extend: z.object({
                id: z.string().optional(),
                type: z.string().optional(),
                status: z.string().optional(),
                summary: z.string().optional(),
                updated: z.string().optional(),
            }),
        }),
    }),
};
