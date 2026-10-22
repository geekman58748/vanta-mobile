import Nav from './components/Nav.jsx'
import Hero from './components/Hero.jsx'
import InfraStrip from './components/InfraStrip.jsx'
import BuiltForSeeker from './components/BuiltForSeeker.jsx'
import Flows from './components/Flows.jsx'
import PrivacyReceipt from './components/PrivacyReceipt.jsx'
import AppPreview from './components/AppPreview.jsx'
import Faq from './components/Faq.jsx'
import Contracts from './components/Contracts.jsx'
import Footer from './components/Footer.jsx'
import WaitlistModal from './components/WaitlistModal.jsx'
import Legal from './components/Legal.jsx'
import { TERMS } from './data/terms.js'
import { PRIVACY } from './data/privacy.js'

/**
 * Path-routed pages, chosen off `location.pathname` with no router dependency.
 *
 * The host already serves index.html for any path (verified live: an unknown
 * route returns the shell), so `/terms` and `/privacy` resolve as real URLs,
 * are linkable, and need no rewrite config.
 */
const PAGES = {
  '/terms': { ...TERMS, related: { label: 'Privacy Policy', href: '/privacy' } },
  '/privacy': { ...PRIVACY, related: { label: 'Terms of Use', href: '/terms' } },
}

const currentPage = () => {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  return PAGES[path] || null
}

/**
 * Vanta landing page.
 *
 * Narrative order: what it is (hero) → what it runs on (infra) → the platform
 * it is built for (Seeker) → how it moves value (flows) → the proof (receipt)
 * → the product (wallet) → the uncomfortable answers (FAQ + contracts) →
 * footer.
 */
export default function App() {
  const page = currentPage()
  if (page) return <Legal {...page} />

  return (
    <div className="min-h-screen bg-canvas">
      <a
        href="#top"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface-2 focus:px-4 focus:py-2 focus:text-[13px] focus:text-ink-strong"
      >
        Skip to content
      </a>

      <Nav />

      <main>
        <Hero />
        <InfraStrip />
        <BuiltForSeeker />
        <Flows />
        <PrivacyReceipt />
        <AppPreview />
        <Faq />
        <Contracts />
      </main>

      <Footer />

      {/* Mounted once; raised by the `vanta:waitlist` event from any placement. */}
      <WaitlistModal />
    </div>
  )
}
