import type { z } from 'zod'
import type { zUserInfo } from '../../../schemas'

export type Methods = {
  get: {
    resBody: z.infer<typeof zUserInfo>
  }
}
