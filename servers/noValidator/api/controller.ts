import { defineController, defineHooks } from './$relay'

export const hooks = defineHooks(() => ({
  onRequest: ({ req }) => {
    console.log('Controller level onRequest hook:', req.url)
  }
}))

export default defineController(() => ({
  get: async v => {
    return await { status: 200, body: { id: +(v.query?.id || 0) } }
  },
  post: v => ({
    // @ts-expect-error
    status: 200,
    body: { id: +v.query.id, port: v.body.port, fileName: 'dummy' }
  })
}))
