import { useLayoutEffect, useRef } from 'react'

/** Used when the scroll element does not define `--nx-scroll-fade-distance`. */
const FALLBACK_FADE_DISTANCE_PX = 120

/**
 * Drives a CSS bottom-fade effect that signals scrollable overflow.
 *
 * Sets `--nx-scroll-fade-opacity` on `wrapperRef` to a value between `0` (fully scrolled down,
 * no more content) and `1` (content below the fold). The fade-in distance is controlled by the
 * `--nx-scroll-fade-distance` CSS custom property on `scrollRef`; falls back to
 * `FALLBACK_FADE_DISTANCE_PX` if the property is absent or non-numeric.
 *
 * @param scrollRef - The overflowing scroll container.
 * @param wrapperRef - The element that receives the `--nx-scroll-fade-opacity` property; typically
 *   a wrapper around `scrollRef` whose `::after` pseudo-element renders the gradient overlay.
 */
export function useScrollOverflow(
  scrollRef: React.RefObject<HTMLElement | null>,
  wrapperRef: React.RefObject<HTMLElement | null>
): void {
  const fadeDistanceRef = useRef(FALLBACK_FADE_DISTANCE_PX)

  useLayoutEffect(() => {
    const scrollEl = scrollRef.current
    const wrapperEl = wrapperRef.current
    if (!scrollEl || !wrapperEl) return

    function readFadeDistance() {
      if (!scrollEl) return
      const raw = getComputedStyle(scrollEl).getPropertyValue('--nx-scroll-fade-distance').trim()
      const parsed = Number.parseFloat(raw)
      fadeDistanceRef.current = Number.isFinite(parsed) ? parsed : FALLBACK_FADE_DISTANCE_PX
    }

    function update() {
      if (!scrollEl || !wrapperEl) return
      if (scrollEl.scrollHeight <= scrollEl.clientHeight) {
        wrapperEl.style.setProperty('--nx-scroll-fade-opacity', '0')
        return
      }
      const scrollableRemaining = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight
      const t = Math.min(1, Math.max(0, scrollableRemaining / fadeDistanceRef.current))
      // Smoothstep easing: starts and ends gradually rather than dropping linearly.
      const opacity = t * t * (3 - 2 * t)
      wrapperEl.style.setProperty('--nx-scroll-fade-opacity', String(opacity))
      // Signal when fully scrolled to the bottom so CSS can suppress the doubled
      // border between the last table row and the pagination footer.
      if (scrollableRemaining < 1) {
        scrollEl.dataset.atBottom = ''
      } else {
        delete scrollEl.dataset.atBottom
      }
    }

    readFadeDistance()
    update()

    scrollEl.addEventListener('scroll', update, { passive: true })

    const resizeObserver = new ResizeObserver(() => {
      readFadeDistance()
      update()
    })
    resizeObserver.observe(scrollEl)

    return () => {
      scrollEl.removeEventListener('scroll', update)
      resizeObserver.disconnect()
    }
  }, [scrollRef, wrapperRef])
}
