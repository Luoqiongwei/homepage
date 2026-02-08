import { defineCollection, z } from 'astro:content';

const gameDocs = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
  }),
});

export const collections = {
  'game-docs': gameDocs,
};