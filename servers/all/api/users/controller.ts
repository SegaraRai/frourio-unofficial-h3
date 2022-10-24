import { defineController, defineHooks } from './$relay'

type AdditionalContext = {
  tmp: string
}

const hooks = defineHooks(() => ({
  preHandler: [
    ({ req }) => {
      console.log('Controller level preHandler hook:', req.url)
    }
  ]
}))

export { hooks, AdditionalContext }

export default defineController(() => ({
  get: async () => ({
    status: 200,
    body: [
      {
        id: 1,
        name: 'aa',
        location: {
          country: 'JP',
          stateProvince: 'Tokyo'
        }
      }
    ]
  }),
  post: () => ({ status: 204 })
}))
