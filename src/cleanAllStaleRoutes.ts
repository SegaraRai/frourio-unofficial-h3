import fs from 'fs'
import path from 'path'
import { cleanStaleRouteDir, isStaleRouteDir } from './cleanStaleRoutes'

export default async (dir: string): Promise<void> => {
  const dfs = async (dir: string, root: boolean) => {
    for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        await dfs(path.resolve(dir, entry.name), false)
      }
    }
    if (!root && (await isStaleRouteDir(dir))) {
      await cleanStaleRouteDir(dir)
    }
  }
  await dfs(path.resolve(dir, 'api'), true)
}
