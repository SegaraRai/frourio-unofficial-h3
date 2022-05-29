import { defineController } from './$relay'

export type AdditionalContext = {
  name: string
}

export default defineController(() => ({
  get: ({ params }) => ({
    status: 200,
    body: {
      id: params.userId,
      name: 'bbb',
      location: {
        country: 'JP',
        stateProvince: 'Tokyo'
      }
    }
  })
}))
