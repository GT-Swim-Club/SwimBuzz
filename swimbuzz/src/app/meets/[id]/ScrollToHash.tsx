"use client"

import { useEffect } from "react"

export default function ScrollToHash() {
  useEffect(() => {
    const hash = window.location.hash
    if (!hash) return

    const hashes = hash.split('#').filter(Boolean)
    const targetId = hashes[hashes.length - 1]
    if (!targetId) return

    if (hashes.length > 1) {
      // Clean up the URL to only show the last hash
      window.history.replaceState(null, "", `${window.location.pathname}#${targetId}`)
    }

    let attempts = 0
    const interval = setInterval(() => {
      const el = document.getElementById(targetId)
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" })
        
        // Apply the effect after the scroll is expected to have finished
        setTimeout(() => {
          // Add a temporary highlight and pop-out effect to the scrolled row
          const originalBg = el.style.backgroundColor
          const originalTransition = el.style.transition
          const originalTransform = el.style.transform
          const originalShadow = el.style.boxShadow
          const originalZIndex = el.style.zIndex
          const originalPosition = el.style.position
          
          el.style.transition = "all 500ms cubic-bezier(0.4, 0, 0.2, 1)"
          el.style.backgroundColor = "var(--brand-color-primary-bg)"
          el.style.transform = "scale(1.02)"
          el.style.boxShadow = "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)"
          el.style.zIndex = "10"
          el.style.position = "relative"
          
          setTimeout(() => {
            el.style.backgroundColor = originalBg
            el.style.transform = originalTransform
            el.style.boxShadow = originalShadow
            setTimeout(() => {
              el.style.transition = originalTransition
              el.style.zIndex = originalZIndex
              el.style.position = originalPosition
            }, 500)
            
            // Remove hash from URL
            window.history.replaceState(null, "", window.location.pathname)
          }, 2000)
        }, 600) // 600ms delay to wait for smooth scroll to complete

        clearInterval(interval)
      }
      attempts++
      if (attempts > 50) { // stop after 5 seconds
        clearInterval(interval)
      }
    }, 100)

    return () => clearInterval(interval)
  }, [])

  return null
}
