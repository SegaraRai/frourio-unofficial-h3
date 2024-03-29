/* eslint-disable jest/no-done-callback */
import rimraf from 'rimraf'
import { dataToURLString } from 'aspida'
import { Router, createApp, createRouter, toNodeListener } from 'h3'
import { Listener, listen } from 'listhen'
import aspida from '@aspida/axios'
import aspidaFetch from '@aspida/node-fetch'
import api from '../servers/all/api/$api'
import frourio from '../servers/all/$server'
import controller from '../servers/all/api/controller'

const port = 23201
const subPort = 23202
const baseURL = `http://localhost:${port}`
const subBasePath = '/api'
const subBaseURL = `http://localhost:${subPort}${subBasePath}`
const client = api(
  aspida(undefined, {
    baseURL,
    // axios v1 format; should be fixed in upstream
    paramsSerializer: {
      serialize: params => dataToURLString(params)
    }
  })
)
const fetchClient = api(aspidaFetch(undefined, { baseURL: subBaseURL, throwHttpErrors: true }))
let server: Listener
let serverRouter: Router
let subServer: Listener

beforeEach(async () => {
  serverRouter = createRouter()
  server = await listen(toNodeListener(createApp().use(frourio(serverRouter))), {
    port
  })
  subServer = await listen(
    toNodeListener(
      createApp().use(
        frourio(createRouter(), {
          basePath: subBasePath
        })
      )
    ),
    {
      port: subPort
    }
  )
})

afterEach(() => {
  rimraf.sync('packages/frourio/servers/all/.upload')
  return Promise.all([server.close(), subServer.close()])
})

test('GET: 200', () =>
  Promise.all(
    [
      {
        requiredNum: 1,
        requiredNumArr: [1, 2],
        id: '1',
        disable: 'false' as const,
        bool: true,
        boolArray: [false, true]
      },
      {
        requiredNum: 2,
        emptyNum: 0,
        requiredNumArr: [],
        id: '1',
        disable: 'false' as const,
        bool: false,
        optionalBool: true,
        boolArray: [],
        optionalBoolArray: [true, false, false]
      }
    ].map(query =>
      Promise.all([
        expect(client.$get({ query })).resolves.toEqual(query),
        expect(fetchClient.$get({ query })).resolves.toEqual(query)
      ])
    )
  ))

test('GET: string', async () => {
  const text = 'test'
  const res = await client.texts.get({ query: { val: text } })
  expect(res.body).toBe(text)
  console.log(res.headers)
  expect(res.headers['content-type']).toBe('text/plain; charset=utf-8')
})

test('GET: params.userId', async () => {
  const userId = 1
  const res = await client.users._userId(userId).get()
  expect(res.body.id).toBe(userId)
  console.log(res.headers)
  expect(res.headers['content-type']).toBe('application/json; charset=utf-8')
})

test('GET: 400', () =>
  Promise.all(
    [
      {
        requiredNum: 0,
        requiredNumArr: [],
        id: '1',
        disable: 'no boolean',
        bool: false,
        boolArray: []
      },
      {
        requiredNum: 0,
        requiredNumArr: [],
        id: '2',
        disable: 'true',
        bool: false,
        boolArray: ['no boolean']
      },
      {
        requiredNum: 0,
        requiredNumArr: ['no number'],
        id: '3',
        disable: 'true',
        bool: false,
        boolArray: []
      },
      {
        requiredNum: 1,
        requiredNumArr: [1, 2],
        id: 'no number',
        disable: 'true',
        bool: false,
        boolArray: []
      }
    ].map(query =>
      Promise.all([
        // @ts-expect-error
        expect(client.get({ query })).rejects.toHaveProperty('response.status', 400),
        // @ts-expect-error
        expect(fetchClient.get({ query })).rejects.toHaveProperty('response.status', 400)
      ])
    )
  ))

test('GET: 500', async () => {
  await expect(client.$500.get()).rejects.toHaveProperty('response.status', 500)
})

test('PUT: JSON', async () => {
  const id = 'abcd'
  const res = await client.texts.sample.$put({ body: { id } })
  expect(res?.id).toBe(id)
})

test('POST: formdata', async () => {
  const port = '3000'
  const res1 = await client.$post({
    query: {
      requiredNum: 0,
      requiredNumArr: [],
      id: '1',
      disable: 'true',
      bool: false,
      boolArray: []
    },
    body: { port }
  })
  expect(res1.port).toBe(port)

  const res2 = await fetchClient.$post({
    query: {
      requiredNum: 0,
      requiredNumArr: [],
      id: '1',
      disable: 'true',
      bool: false,
      boolArray: []
    },
    body: { port }
  })
  expect(res2.port).toBe(port)
})

// FIXME: multipart/form-data is currently not supported in h3
// using formidable or multer may solve this but they only work on Node.js
/*
test('POST: multi file upload', async () => {
  const form = new FormData()
  form.append('optionalArr', 'sample')
  form.append('name', 'sample')
  form.append('vals', 'dammy')
  const res = await axios.post(`${baseURL}/multiForm`, form, {
    headers: form.getHeaders()
  })

  expect(res.data).toEqual({
    requiredArr: 0,
    optionalArr: 1,
    name: -1,
    icon: -1,
    vals: 1,
    files: 2
  })
})

test('POST: 400', async () => {
  const fileName = 'tsconfig.json'
  const form = new FormData()
  const fileST = fs.createReadStream(fileName)
  form.append('name', 'sample')
  form.append('vals', 'dammy')
  form.append('icon', fileST)

  await expect(
    axios.post(`${baseURL}/multiForm`, form, {
      headers: form.getHeaders()
    })
  ).rejects.toHaveProperty('response.status', 400)
})
// */

test('POST: nested validation', async () => {
  const res1 = await client.users.post({
    body: {
      id: 123,
      name: 'foo',
      location: {
        country: 'JP',
        stateProvince: 'Tokyo'
      }
    }
  })
  expect(res1.status).toBe(204)

  // Note that extraneous properties are allowed by default
  const res2 = await client.users.post({
    body: {
      id: 123,
      name: 'foo',
      location: {
        country: 'JP',
        stateProvince: 'Tokyo',
        extra1: {
          extra1a: 'bar',
          extra1b: 'baz'
        }
      },
      extra2: 'qux'
    } as any
  })
  expect(res2.status).toBe(204)
})

test('POST: 400 (nested validation)', async () => {
  // id is not a number
  await expect(
    client.users.post({
      body: {
        id: '123',
        name: 'foo',
        location: {
          country: 'JP',
          stateProvince: 'Tokyo'
        }
      } as any
    })
  ).rejects.toHaveProperty('response.status', 400)

  // location is missing
  await expect(
    client.users.post({
      body: { id: 123, name: 'foo' } as any
    })
  ).rejects.toHaveProperty('response.status', 400)

  // country is not a valid 2-letter country code
  await expect(
    client.users.post({
      body: {
        id: 123,
        name: 'foo',
        location: {
          country: 'XX',
          stateProvince: 'Tokyo'
        }
      } as any
    })
  ).rejects.toHaveProperty('response.status', 400)

  // stateProvince is not a string
  await expect(
    client.users.post({
      body: {
        id: 123,
        name: 'foo',
        location: {
          country: 'JP',
          stateProvince: 1234
        }
      } as any
    })
  ).rejects.toHaveProperty('response.status', 400)
})

test('controller dependency injection', async () => {
  let val = 0
  const id = '5'
  const injectedController = controller
    .inject({
      log: () => {
        throw new Error()
      }
    })
    .inject(() => ({
      log: n => {
        val = +n * 2
        return Promise.resolve(`${val}`)
      }
    }))(serverRouter)

  await expect(
    injectedController.get(
      {
        query: {
          id,
          requiredNum: 1,
          requiredNumArr: [0],
          disable: 'true',
          bool: false,
          boolArray: []
        }
      },
      {} as any
    )
  ).resolves.toHaveProperty('body.id', `${+id * 2}`)
  expect(val).toBe(+id * 2)
})
