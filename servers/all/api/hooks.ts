import { defineHooks } from './$relay'

export default defineHooks(() => ({
  onRequest: [
    ({ req }) => {
      console.log('Directory level middleware:', req.url)
    }
  ],
  preHandler: ({ req }) => {
    console.log('Directory level middleware:', req.url)
  }
}))
