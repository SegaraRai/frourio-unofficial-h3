import { defineHooks } from './$relay'

export type AdditionalContext = {
  cookie?: string
}

export default defineHooks(() => ({
  onRequest: () => {
    // nothing to do
  }
}))
