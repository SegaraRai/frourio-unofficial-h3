import { defineHooks, useContext } from './$relay'

export type AdditionalContext = {
  user: {
    id: number
    name: string
    role: 'admin' | 'user'
  }
}

export default defineHooks(() => ({
  onRequest: (req, _, done) => {
    console.log('Added user')
    const ctx = useContext(req)
    ctx.user = { id: 1, name: 'user name', role: 'admin' }
    done()
  }
}))
