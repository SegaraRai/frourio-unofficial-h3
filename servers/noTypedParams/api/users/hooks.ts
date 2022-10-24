import { defineHooks, useContext } from './$relay'

export type AdditionalContext = {
  user: {
    id: number
    name: string
    role: 'admin' | 'user'
  }
}

export default defineHooks(() => ({
  onRequest: event => {
    console.log('Added user')
    const ctx = useContext(event)
    ctx.user = { id: 1, name: 'user name', role: 'admin' }
  }
}))
