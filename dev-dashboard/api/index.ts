// api/index.ts — serves the dashboard HTML behind Basic Auth.
// Replaces the static public/index.html so the page itself is not public on Hobby.
import { readFileSync } from 'fs'
import { join } from 'path'
import { requireBasicAuth } from './auth'

export default function handler(req: any, res: any) {
  if (!requireBasicAuth(req, res)) return
  try {
    const html = readFileSync(join(process.cwd(), 'views', 'index.html'), 'utf8')
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.status(200).send(html)
  } catch (e: any) {
    res.status(500).send(String(e?.message || e))
  }
}
