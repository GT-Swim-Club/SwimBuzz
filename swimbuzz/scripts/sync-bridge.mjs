import { copyFileSync, mkdirSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const scraper = join(root, "..", "scraper")
const out = join(root, "public", "bridge")

mkdirSync(out, { recursive: true })

for (const file of ["bridge.py", "swimcloud_scrape.py", "requirements-bridge.txt"]) {
  const dest = file === "requirements-bridge.txt" ? "requirements.txt" : file
  copyFileSync(join(scraper, file), join(out, dest))
}

console.log("Synced bridge files to public/bridge/")
