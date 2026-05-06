import { defineCollection, defineContentConfig, z } from '@nuxt/content';

export default defineContentConfig({
  collections: {
    pages: defineCollection({
      type: 'page',
      source: {
        include: 'pages/**/*.md',
        prefix: '/'
      },
      schema: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        order: z.number().optional()
      }),
    }),
    projects: defineCollection({
        type: 'data',
        source: {
            include: 'projects/**/*.md',
            prefix: '/projects'
        },
        schema: z.object({
            position: z.string(),
            company: z.string(),
            period: z.string(),
            description: z.string(),
            link: z.string().optional(),
            order: z.number().optional(),
            technologies: z.array(z.string()).optional()
        }),
    })
  },
});