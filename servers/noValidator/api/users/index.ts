import type { UserInfo } from '../../schemas'

export type Methods = {
  get: {
    resBody: UserInfo[]
  }

  post: {
    reqBody: UserInfo
  }
}
