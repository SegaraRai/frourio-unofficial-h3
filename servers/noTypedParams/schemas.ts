import { z } from 'zod'

export const zQuery = z.object({
  id: z.string().regex(/^\d+$/),
  disable: z.string().regex(/^(true|false)$/)
})

export const zBody = z.object({
  port: z.string().regex(/^\d+$/)
})

export const zUserInfo = z.object({
  id: z.number().int(),
  name: z.string().max(20)
})

export const zMultiForm = z.object({
  empty: z.number().array(),
  name: z.string(),
  vals: z.string().array()
})
