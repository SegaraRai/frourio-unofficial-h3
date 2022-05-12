import type { z } from 'zod'
import type { zMultiForm } from '../../schemas'

export type Methods = {
  post: {
    reqFormat: FormData
    reqBody: z.infer<typeof zMultiForm>
    resBody: {
      empty: number
      name: number
      icon: number
      vals: number
      files: number
    }
  }
}
