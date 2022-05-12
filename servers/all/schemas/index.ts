import { z } from 'zod'

export const zUserInfo = z.object({
  id: z.number().int(),
  name: z.string().max(20),
  location: z.object({
    country: z.union([z.literal('US'), z.literal('JP')]),
    stateProvince: z.string()
  })
})

export const zBody = z.object({
  port: z.string().regex(/^\d+$/)
})

export const zQuery = z.object({
  requiredNum: z.number().int(),
  optionalNum: z.number().int().optional(),
  optionalNumArr: z.array(z.number().int()).optional(),
  emptyNum: z.number().int().optional(),
  requiredNumArr: z.array(z.number().int()),
  id: z.string().regex(/^\d+$/),
  disable: z.union([z.literal('true'), z.literal('false')]),
  bool: z.boolean(),
  optionalBool: z.boolean().optional(),
  boolArray: z.array(z.boolean()),
  optionalBoolArray: z.array(z.boolean()).optional()
})

export const zMultiForm = z.object({
  requiredArr: z.string().array(),
  optionalArr: z.string().array().optional(),
  empty: z.number().int().array().optional(),
  name: z.string(),
  vals: z.string().array()
})
