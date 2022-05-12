import type { zBody, zQuery } from 'schemas'
import type { z } from 'zod'

export type Methods = {
  get: {
    query?: z.infer<typeof zQuery>
    status: 200
    resBody?: z.infer<typeof zQuery>
  }

  post: {
    query: z.infer<typeof zQuery>
    reqBody: z.infer<typeof zBody>
    status: 201
    resBody: {
      id: number
      port: string
      fileName: string
    }
  }
}
