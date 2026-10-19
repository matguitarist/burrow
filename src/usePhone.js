import { useState, useEffect } from 'react'

// True at phone widths — same breakpoint as the mobile CSS (bottom tab bar)
const QUERY = '(max-width: 768px)'

export default function usePhone() {
  const [phone, setPhone] = useState(() => window.matchMedia(QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const on = () => setPhone(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return phone
}
