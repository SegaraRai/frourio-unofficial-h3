import type { z } from 'zod'
import type { zQuery, zBody } from '../schemas'

export type Methods = {
  get: {
    query?: z.infer<typeof zQuery>
    status: 200
    resBody?: { id: number }
  }

  post: {
    query: z.infer<typeof zQuery>
    reqFormat: FormData
    reqBody: z.infer<typeof zBody>
    status: 201
    resBody: {
      id: number
      port: string
      fileName: string
    }
  }
}
