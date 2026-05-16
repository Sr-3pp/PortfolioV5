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
    }),
    certificates: defineCollection({
      type: 'data',
      source: 'json/certificates/*.json',
      schema: z.object({
        name: z.string(),
        issuer: z.string(),
        link: z.string(),
        thumbnail: z.string(),
        summary: z.string().optional()
      })
    }),
    cv: defineCollection({
      type: 'data',
      source: 'json/cv.json',
      schema: z.object({
        name: z.string(),
        title: z.string(),
        location: z.string(),
        contact: z.object({
          website: z.string().optional(),
          linkedin: z.string().optional(),
          github: z.string().optional(),
          email: z.string().optional(),
        }),
        profile: z.string(),
        experience: z.array(z.object({
          company: z.string(),
          role: z.string(),
          start_date: z.string(),
          end_date: z.string().nullable().optional(),
          highlights: z.array(z.string()),
          technologies: z.array(z.string()).optional()
        })),
        freelance_projects: z.array(z.object({
          name: z.string(),
          description: z.string(),
          link: z.string().optional(),
        })).optional(),
        education: z.array(z.object({
          program: z.string(),
          institution: z.string().nullable().optional(),
          start_year: z.number(),
          end_year: z.number().nullable().optional(),
        })).optional(),
        skills: z.object({
          frontend: z.array(z.string()),
          backend: z.array(z.string()),
          tools: z.array(z.string()),
          languages: z.array(z.string()),
        }).optional(),
        source: z.string().optional(),
      })
    }),
  },
});