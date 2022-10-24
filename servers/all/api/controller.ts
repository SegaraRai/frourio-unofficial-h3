import { defineController, defineHooks } from '~/$relay'
import { depend } from 'velona'

const hooks = defineHooks({ print: (...args: string[]) => console.log(...args) }, ({ print }) => ({
  onRequest: depend({}, (_deps, { req }) => {
    print('Controller level onRequest hook:', req.url || '')
  })
}))

export default defineController(
  {
    log: (n: string) => {
      console.log(n)
      return Promise.resolve(n)
    }
  },
  ({ log }) => ({
    get: async v => {
      return { status: 200, body: v.query && { ...v.query, id: await log(v.query.id) } }
    },
    post: v => ({
      // @ts-expect-error
      status: 200,
      body: { id: +v.query.id, port: v.body.port, fileName: 'dummy' }
    })
  })
)

export { hooks }
