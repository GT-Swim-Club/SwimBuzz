import { useMemo, type ReactNode } from "react"
import {
  Linking,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
} from "react-native"
import { decodeHtmlEntities, isHtmlEmpty } from "@swimbuzz/shared"
import { usePalette } from "@swimbuzz/ui"
import type { ColorPalette } from "@swimbuzz/tokens"

type HtmlNode =
  | { type: "text"; value: string }
  | { type: "element"; tag: string; attrs: Record<string, string>; children: HtmlNode[] }

const VOID_TAGS = new Set(["br", "hr", "img"])
const BLOCK_TAGS = new Set([
  "p",
  "div",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "pre",
])
const SKIP_TAGS = new Set(["script", "style"])

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const pattern =
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(raw))) {
    attrs[match[1].toLowerCase()] = decodeHtmlEntities(
      match[2] ?? match[3] ?? match[4] ?? ""
    )
  }
  return attrs
}

function parseHtml(html: string): HtmlNode[] {
  const root: HtmlNode[] = []
  const stack: Array<{ tag: string; attrs: Record<string, string>; children: HtmlNode[] }> = [
    { tag: "root", attrs: {}, children: root },
  ]
  const token = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)\/?>|([^<]+)/g
  let match: RegExpExecArray | null

  while ((match = token.exec(html))) {
    const parent = stack[stack.length - 1]
    if (!parent) break

    if (match[0].startsWith("<!--")) continue

    if (match[3] != null) {
      const value = decodeHtmlEntities(match[3])
      if (value) parent.children.push({ type: "text", value })
      continue
    }

    const tag = match[1].toLowerCase()
    const closing = match[0].startsWith("</")
    const selfClosing = VOID_TAGS.has(tag) || /\/\s*>$/.test(match[0])
    const attrs = parseAttrs(match[2] ?? "")

    if (SKIP_TAGS.has(tag)) {
      if (!closing && !selfClosing) {
        const close = new RegExp(`</${tag}\\s*>`, "i")
        close.lastIndex = token.lastIndex
        const rest = html.slice(token.lastIndex)
        const closeMatch = close.exec(rest)
        if (closeMatch) token.lastIndex += closeMatch.index + closeMatch[0].length
        else token.lastIndex = html.length
      }
      continue
    }

    if (closing) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i
          break
        }
      }
      continue
    }

    const node: HtmlNode = { type: "element", tag, attrs, children: [] }
    parent.children.push(node)
    if (!selfClosing) {
      stack.push({ tag, attrs, children: node.children })
    }
  }

  return root
}

function isBlock(node: HtmlNode): boolean {
  return node.type === "element" && BLOCK_TAGS.has(node.tag)
}

export function FormattedText({
  html,
  style,
  mono = false,
}: {
  html: string | null | undefined
  style?: StyleProp<TextStyle>
  mono?: boolean
}) {
  const c = usePalette()
  const nodes = useMemo(() => (html && !isHtmlEmpty(html) ? parseHtml(html) : []), [html])
  const styles = useMemo(() => makeStyles(c, mono), [c, mono])

  if (nodes.length === 0) return null

  return <View>{renderChildren(nodes, styles, style, 0)}</View>
}

function renderChildren(
  nodes: HtmlNode[],
  styles: ReturnType<typeof makeStyles>,
  style: StyleProp<TextStyle>,
  listDepth: number
) {
  const out: ReactNode[] = []
  let inline: HtmlNode[] = []

  function flushInline(key: string) {
    if (inline.length === 0) return
    out.push(
      <Text key={key} style={[styles.text, style]}>
        {inline.map((node, i) => renderInline(node, styles, style, `${key}-${i}`))}
      </Text>
    )
    inline = []
  }

  nodes.forEach((node, index) => {
    if (isBlock(node)) {
      flushInline(`inline-${index}`)
      out.push(renderBlock(node, styles, style, listDepth, `block-${index}`))
      return
    }
    inline.push(node)
  })
  flushInline("inline-end")
  return out
}

function isEmptyNode(node: HtmlNode): boolean {
  if (node.type === "text") return node.value.trim() === ""
  if (node.tag === "br") return true
  return node.children.every(isEmptyNode)
}

function renderBlock(
  node: HtmlNode,
  styles: ReturnType<typeof makeStyles>,
  style: StyleProp<TextStyle>,
  listDepth: number,
  key: string
): ReactNode {
  if (node.type !== "element") return null
  if (node.tag === "p" && isEmptyNode(node)) return null

  if (node.tag === "ul" || node.tag === "ol") {
    let itemIndex = 0
    return (
      <View key={key} style={styles.list}>
        {node.children.map((child, i) => {
          if (child.type !== "element" || child.tag !== "li") return null
          itemIndex += 1
          const marker = node.tag === "ol" ? `${itemIndex}.` : "•"
          return (
            <View key={`${key}-li-${i}`} style={styles.listItem}>
              <Text style={[styles.text, styles.marker, style]}>{marker}</Text>
              <View style={styles.listItemBody}>
                {renderChildren(child.children, styles, style, listDepth + 1)}
              </View>
            </View>
          )
        })}
      </View>
    )
  }

  if (node.tag === "li") {
    return (
      <View key={key} style={styles.listItem}>
        <Text style={[styles.text, styles.marker, style]}>•</Text>
        <View style={styles.listItemBody}>
          {renderChildren(node.children, styles, style, listDepth)}
        </View>
      </View>
    )
  }

  if (node.tag === "br") {
    return <Text key={key}>{"\n"}</Text>
  }

  return (
    <View key={key} style={node.tag === "p" ? styles.paragraph : undefined}>
      {renderChildren(node.children, styles, style, listDepth)}
    </View>
  )
}

function renderInline(
  node: HtmlNode,
  styles: ReturnType<typeof makeStyles>,
  style: StyleProp<TextStyle>,
  key: string
): ReactNode {
  if (node.type === "text") {
    return <Text key={key}>{node.value}</Text>
  }

  if (node.tag === "br") {
    return <Text key={key}>{"\n"}</Text>
  }

  if (isBlock(node)) {
    return (
      <Text key={key}>
        {"\n"}
        {node.children.map((child, i) =>
          renderInline(child, styles, style, `${key}-${i}`)
        )}
        {"\n"}
      </Text>
    )
  }

  const nested = node.children.map((child, i) =>
    renderInline(child, styles, style, `${key}-${i}`)
  )

  if (node.tag === "strong" || node.tag === "b") {
    return (
      <Text key={key} style={styles.bold}>
        {nested}
      </Text>
    )
  }
  if (node.tag === "em" || node.tag === "i") {
    return (
      <Text key={key} style={styles.italic}>
        {nested}
      </Text>
    )
  }
  if (node.tag === "u") {
    return (
      <Text key={key} style={styles.underline}>
        {nested}
      </Text>
    )
  }
  if (node.tag === "s" || node.tag === "strike" || node.tag === "del") {
    return (
      <Text key={key} style={styles.strike}>
        {nested}
      </Text>
    )
  }
  if (node.tag === "code") {
    return (
      <Text key={key} style={styles.code}>
        {nested}
      </Text>
    )
  }
  if (node.tag === "a") {
    const href = node.attrs.href?.trim() ?? ""
    const safe = /^https?:\/\//i.test(href)
    return (
      <Text
        key={key}
        style={styles.link}
        onPress={safe ? () => void Linking.openURL(href) : undefined}
      >
        {nested}
      </Text>
    )
  }

  return <Text key={key}>{nested}</Text>
}

function makeStyles(c: ColorPalette, mono: boolean) {
  return StyleSheet.create({
    text: {
      color: c.text,
      fontFamily: mono ? "Menlo" : undefined,
      fontSize: 16,
      lineHeight: 22,
    },
    bold: { fontWeight: "700" },
    italic: { fontStyle: "italic" },
    underline: { textDecorationLine: "underline" },
    strike: { textDecorationLine: "line-through" },
    code: { fontFamily: "Menlo", fontSize: 14 },
    link: { color: c.link, textDecorationLine: "underline" },
    paragraph: { marginBottom: 8 },
    list: { marginBottom: 8, marginTop: 2 },
    listItem: { flexDirection: "row", marginBottom: 4 },
    marker: { width: 18 },
    listItemBody: { flex: 1 },
  })
}
