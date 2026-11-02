import './purchase.css'

const programs = [
  ['Customer', 'Order metal, pay instalments, track every receipt.'],
  ['Associate', 'Manage customers, grow a downline, watch commission land.'],
  ['Admin', 'Control pricing, rules, payouts and the full audit trail.'],
]

function AssociatesPage() {
  return (
    <div className="purchase-page">
      <header className="purchase-header">
        <div className="purchase-header-inner">
          <a className="purchase-brand" href="/" aria-label="KorViana home">
            <img src="/korviana-logo.png" alt="KorViana Ventures LLP" />
          </a>
          <nav className="purchase-nav" aria-label="Main navigation">
            <a href="/">Home</a>
            <a href="/about.html">About</a>
            <a href="/purchase.html">Purchase</a>
            <a href="/associates.html" aria-current="page">Associates</a>
          </nav>
        </div>
      </header>

      <main className="purchase-main">
        <section className="purchase-intro">
          <p className="purchase-eyebrow">ASSOCIATES</p>
          <h1>ASSOCIATES</h1>
          <p>Three portals, one program. Sign in from the home page to reach your portal.</p>
        </section>

        <section className="purchase-panel" aria-label="Portals">
          <ul className="summary-item-list">
            {programs.map(([title, description]) => (
              <li key={title}><strong>{title} login</strong><span>{description}</span></li>
            ))}
          </ul>
          <p className="summary-note"><a href="/">Go to sign in</a></p>
        </section>
      </main>
      <footer className="purchase-footer">
        <span>KorViana Ventures LLP</span>
        <a href="/">Back to home</a>
      </footer>
    </div>
  )
}

export default AssociatesPage
