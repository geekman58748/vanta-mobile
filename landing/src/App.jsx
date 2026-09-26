import Nav from './components/Nav.jsx'
import Hero from './components/Hero.jsx'
import InfraStrip from './components/InfraStrip.jsx'
import Flows from './components/Flows.jsx'
import PrivacyReceipt from './components/PrivacyReceipt.jsx'
import AppPreview from './components/AppPreview.jsx'
import Faq from './components/Faq.jsx'
import Contracts from './components/Contracts.jsx'
import Footer from './components/Footer.jsx'

/**
 * Vanta landing page.
 *
 * Narrative order: what it is (hero) → what it runs on (infra) → how it
 * moves value (flows) → the proof (receipt) → the product (wallet) → the
 * uncomfortable answers (FAQ + contracts) → footer.
 */
export default function App() {
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
        <Flows />
        <PrivacyReceipt />
        <AppPreview />
        <Faq />
        <Contracts />
      </main>

      <Footer />
    </div>
  )
}
