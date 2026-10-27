/**
 * Node module hooks that let a script import the app's TypeScript source as is (Node 23.6+ strips
 * the types): resolves the "@/…" path alias and extensionless imports the way Next.js does.
 *   import { register } from "node:module"
 *   register("./ts-source-loader.mjs", import.meta.url)
 */
import { existsSync, statSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"

const src = new URL("../src/", import.meta.url)
const EXTENSIONS = [".ts", ".tsx", ".js", "/index.ts", "/index.tsx", "/index.js"]

function withExtension(url) {
  const path = fileURLToPath(url)
  if (existsSync(path) && statSync(path).isFile()) return url
  for (const ext of EXTENSIONS) {
    if (existsSync(path + ext)) return pathToFileURL(path + ext).href
  }
  return null
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const found = withExtension(new URL(specifier.slice(2), src).href)
    if (found) return { url: found, shortCircuit: true }
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    const found = withExtension(new URL(specifier, context.parentURL).href)
    if (found) return { url: found, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}
