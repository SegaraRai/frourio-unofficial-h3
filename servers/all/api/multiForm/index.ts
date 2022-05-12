import type { zMultiForm } from 'schemas'
import type { z } from 'zod'

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
