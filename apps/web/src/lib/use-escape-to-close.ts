"use client"

import { useEffect, useLayoutEffect, useRef } from "react"

// Open dismissable layers (modals, menus, popovers), oldest first. Escape only closes the
// newest one, so dismissing a picker inside a modal doesn't also close the modal.
const layers: symbol[] = []

/**
 * Close a layer on Escape while it's open. A disabled layer (e.g. mid-save) still swallows
 * Escape so the layers beneath it stay open.
 */
export function useEscapeToClose(
  open: boolean,
  onClose: () => void,
  { disabled = false }: { disabled?: boolean } = {},
) {
  const onCloseRef = useRef(onClose)
  const disabledRef = useRef(disabled)
  useLayoutEffect(() => {
    onCloseRef.current = onClose
    disabledRef.current = disabled
  })

  useEffect(() => {
    if (!open) return
    const id = Symbol()
    layers.push(id)
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.isComposing || event.defaultPrevented) return
      if (layers[layers.length - 1] !== id) return
      if (disabledRef.current) return
      onCloseRef.current()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      const index = layers.indexOf(id)
      if (index !== -1) layers.splice(index, 1)
    }
  }, [open])
}
