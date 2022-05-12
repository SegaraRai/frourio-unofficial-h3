import { z } from 'zod'

export const zQuery = z.object({
  id: z.string(),
  disable: z.string()
})

export const zBody = z.object({
  port: z.string().regex(/^\d+$/)
})

export const zUserInfo = z.object({
  id: z.number().int(),
  name: z.string().max(20)
})
