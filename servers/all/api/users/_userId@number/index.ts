import type { zUserInfo } from 'schemas'
import type { z } from 'zod'

export type Methods = {
  get: {
    resBody: z.infer<typeof zUserInfo>
  }
}
