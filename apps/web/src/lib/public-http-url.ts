import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

const DEFAULT_MAX_REDIRECTS = 3

function isPrivateIpv4(address: string): boolean {
  const [first, second] = address.split(".").map(Number)
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127) ||
    first >= 224
  )
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase()
  const family = isIP(normalized)
  if (family === 4) return isPrivateIpv4(normalized)
  if (family !== 6) return true
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  )
}

export async function validatePublicHttpUrl(value: string): Promise<URL> {
  const url = new URL(value)
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Unsupported URL")
  if (url.username || url.password) throw new Error("Unsupported URL")
  const hostname = url.hostname.toLowerCase()
  if (hostname === "localhost" || hostname.endsWith(".localhost")) throw new Error("Unsupported URL")

  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true })
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Unsupported URL")
  }
  return url
}

export async function fetchPublicHttpUrl(
  value: string,
  init: RequestInit & { maxRedirects?: number } = {}
): Promise<Response> {
  const { maxRedirects = DEFAULT_MAX_REDIRECTS, ...requestInit } = init

  async function load(url: URL, redirects: number): Promise<Response> {
    if (redirects > maxRedirects) throw new Error("Too many redirects")
    const response = await fetch(url, { ...requestInit, redirect: "manual" })
    if (response.status < 300 || response.status >= 400) return response
    const location = response.headers.get("location")
    if (!location) throw new Error("Invalid redirect")
    return load(await validatePublicHttpUrl(new URL(location, url).toString()), redirects + 1)
  }

  return load(await validatePublicHttpUrl(value), 0)
}
