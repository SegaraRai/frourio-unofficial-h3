import { defineController, defineHooks } from './$relay'

const hooks = defineHooks(() => ({
  preHandler: [
    ({ req }) => {
      console.log('Controller level preHandler hook:', req.url)
    }
  ]
}))

export { hooks }

export default defineController(() => ({
  get: async () => ({ status: 200, body: [{ id: 1, name: 'aa' }] }),
  post: () => ({ status: 204 })
}))
