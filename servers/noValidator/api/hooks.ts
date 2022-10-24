import { defineHooks } from './$relay'

export default defineHooks(() => ({
  onRequest: ({ req }) => {
    console.log('Directory level middleware:', req.url)
  }
}))
