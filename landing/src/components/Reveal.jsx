import { useEffect, useRef, useState } from 'react'

/**
 * Scroll-reveal primitive — the page's only entrance motion.
 *
 * design.md motion rules: one authored moment per page plus interaction
 * feedback; explain, never decorate; respect prefers-reduced-motion.
 * The authored moment is the receipt, but sections use the same quiet rise so
 * the pacing stays consistent. Stagger via the `delay` prop (ms).
 */
export default function Reveal({ children, delay = 0, as: Tag = 'div', className = '' }) {
  const ref = useRef(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    // Honour reduced motion: show immediately, never observe.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(true)
      return
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    )

    io.observe(node)
    return () => io.disconnect()
  }, [])

  return (
    <Tag
      ref={ref}
      className={`reveal ${shown ? 'is-in' : ''} ${className}`}
      style={{ '--reveal-delay': `${delay}ms` }}
    >
      {children}
    </Tag>
  )
}
