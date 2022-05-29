import { defineHooks } from './$relay'

export type AdditionalContext = {
  cookie?: string
}

export default defineHooks(() => ({
  onRequest: (_req, _, done) => {
    done()
  }
}))
