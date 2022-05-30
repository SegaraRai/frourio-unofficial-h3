import fs from 'fs'
import path from 'path'

const isManagedJSTSFile = (filepath: string): boolean => {
  return Boolean(filepath.match(/^\$.*\.[mc]?[jt]s$/))
}

export const isStaleRouteDir = async (routeDir: string): Promise<boolean> => {
  try {
    const entries = await fs.promises.readdir(routeDir, { withFileTypes: true })
    if (entries.length === 0) return false
    for (const p of entries) {
      if (p.isDirectory()) return false
      if (!isManagedJSTSFile(p.name)) return false
    }
    return true
  } catch (e: unknown) {
    return false
  }
}

export const cleanStaleRouteDir = async (routeDir: string): Promise<void> => {
  try {
    const entries = await fs.promises.readdir(routeDir, { withFileTypes: true })
    if (entries.length === 0) return
    for (const p of entries) {
      if (p.isDirectory()) return
      if (!isManagedJSTSFile(p.name)) return
      await fs.promises.unlink(path.resolve(routeDir, p.name))
    }
    await fs.promises.rmdir(routeDir)
  } catch (e: unknown) {}
}

export default async (dir: string, event: string, file: string): Promise<void> => {
  if (event !== 'unlink' && event !== 'unlinkDir') return
  const routeDir = path.dirname(path.resolve(dir, file))

  if (await isStaleRouteDir(routeDir)) {
    await cleanStaleRouteDir(routeDir)
  }
}
