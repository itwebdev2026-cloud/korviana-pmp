import { useEffect, useRef, useState } from 'react'
import {
  calculateKorvianaPrice,
  RATE_DENOMINATIONS,
  rateMarkupKey,
} from './lib/ratePricing'
import {
  getLocalMetalPricingState,
  subscribeToLocalMetalPricing,
} from './lib/localMetalPricing'
import './purchase.css'

const weightsByItem = Object.fromEntries(
  Object.entries(RATE_DENOMINATIONS).map(([metal, denominations]) => [
    metal === 'gold' ? 'Gold' : 'Silver',
    denominations.map(({ weightGrams }) => weightGrams === 1000 ? '1 kg' : `${weightGrams} g`),
  ]),
)

const normalizeDenomination = (value) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()

const rupees = (value) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

function priceFor(denomination, quantity, pricing) {
  const match = denomination.trim().match(/^(\d+(?:\.\d+)?)\s*(g|kg)\s+(gold|silver)$/i)
  if (!match || !pricing) return null
  const metal = match[3].toLowerCase()
  const grams = Number(match[1]) * (match[2].toLowerCase() === 'kg' ? 1000 : 1)
  const unitPrice = calculateKorvianaPrice(
    metal,
    pricing.rates[metal],
    grams,
    pricing.markups[rateMarkupKey(metal, grams)],
  )
  return unitPrice == null ? null : unitPrice * quantity
}

function PurchasePage() {
  const [pricingState, setPricingState] = useState(getLocalMetalPricingState)
  const { pricing, error: pricingError } = pricingState
  useEffect(() => {
    const unsubscribe = subscribeToLocalMetalPricing(
      (localPricing) => setPricingState({ pricing: localPricing, error: '' }),
      (loadError) => setPricingState({ pricing: null, error: loadError.message }),
    )
    return unsubscribe
  }, [])
  const [itemType, setItemType] = useState('Gold')
  const [denomination, setDenomination] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [items, setItems] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [editDenomination, setEditDenomination] = useState('')
  const [editQuantity, setEditQuantity] = useState('1')
  const [formMessage, setFormMessage] = useState('')
  const [submitMessage, setSubmitMessage] = useState('')
  const nextId = useRef(0)

  const totalQuantity = items.reduce((total, item) => total + item.quantity, 0)
  const linePrices = items.map((item) => priceFor(item.denomination, item.quantity, pricing))
  const allPriced = items.length > 0 && linePrices.every((price) => price != null)
  const totalPrice = linePrices.reduce((sum, price) => sum + (price ?? 0), 0)

  const addItem = (event) => {
    event.preventDefault()
    const weight = denomination.trim().replace(/\s+/g, ' ')
    const parsedQuantity = Number(quantity)

    if (!weight) {
      setFormMessage('Enter or select a denomination or weight.')
      return
    }
    const cleanDenomination = `${weight} ${itemType}`
    if (!Number.isSafeInteger(parsedQuantity) || parsedQuantity <= 0) {
      setFormMessage('Enter a whole-number quantity greater than zero.')
      return
    }
    if (priceFor(cleanDenomination, parsedQuantity, pricing) == null) {
      setFormMessage('Rates are unavailable or that denomination is not in the published price list.')
      return
    }

    const normalized = normalizeDenomination(cleanDenomination)
    const newItem = { id: nextId.current++, denomination: cleanDenomination, quantity: parsedQuantity }
    setItems((current) => {
      const existing = current.find((item) => normalizeDenomination(item.denomination) === normalized)
      if (existing) {
        return current.map((item) => item.id === existing.id
          ? { ...item, quantity: item.quantity + parsedQuantity }
          : item)
      }
      return [...current, newItem]
    })
    setDenomination('')
    setQuantity('1')
    setFormMessage('')
    setSubmitMessage('')
  }

  const startEditing = (item) => {
    setEditingId(item.id)
    setEditDenomination(item.denomination)
    setEditQuantity(String(item.quantity))
    setFormMessage('')
  }

  const saveEdit = (event) => {
    event?.preventDefault()
    const cleanDenomination = editDenomination.trim().replace(/\s+/g, ' ')
    const parsedQuantity = Number(editQuantity)
    if (!cleanDenomination || !Number.isSafeInteger(parsedQuantity) || parsedQuantity <= 0) {
      setFormMessage('Enter a denomination and a whole-number quantity greater than zero.')
      return
    }
    const existingItem = items.find((item) => item.id === editingId)
    const existingMetal = existingItem?.denomination.match(/(gold|silver)$/i)?.[1]
    const pricedDenomination = /(?:gold|silver)$/i.test(cleanDenomination)
      ? cleanDenomination
      : `${cleanDenomination} ${existingMetal ?? ''}`.trim()
    if (priceFor(pricedDenomination, parsedQuantity, pricing) == null) {
      setFormMessage('That denomination is not in the published price list.')
      return
    }

    const normalized = normalizeDenomination(pricedDenomination)
    setItems((current) => {
      const edited = current.find((item) => item.id === editingId)
      if (!edited) return current
      const duplicate = current.find((item) =>
        item.id !== editingId && normalizeDenomination(item.denomination) === normalized)
      return current
        .filter((item) => item.id !== duplicate?.id)
        .map((item) => item.id === editingId
          ? {
            ...item,
            denomination: pricedDenomination,
            quantity: parsedQuantity + (duplicate?.quantity ?? 0),
          }
          : item)
    })
    setEditingId(null)
    setFormMessage('')
    setSubmitMessage('')
  }

  const removeItem = (id) => {
    setItems((current) => current.filter((item) => item.id !== id))
    if (editingId === id) setEditingId(null)
    setSubmitMessage('')
  }

  const submitRequest = (event) => {
    event.preventDefault()
    if (items.length === 0 || !allPriced) return
    const itemLines = items.map((item, index) =>
      `${index + 1}. ${item.denomination} — quantity ${item.quantity}${linePrices[index] != null ? ` — ${rupees(linePrices[index])}` : ''}`)
    const body = [
      'Hello KorViana,',
      '',
      'I would like to submit the following purchase request:',
      ...itemLines,
      '',
      `Different items: ${items.length}`,
      `Total quantity: ${totalQuantity}`,
      ...(allPriced ? [`Total price: ${rupees(totalPrice)}`] : []),
      '',
      'Please contact me to discuss this request.',
    ].join('\n')
    const subject = 'Purchase request from KorViana website'
    window.location.href = `mailto:korvianamail@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    setSubmitMessage('Your email app should open with the request details. Send that email to complete your request; if it does not open, contact korvianamail@gmail.com.')
  }

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
            <a href="/purchase.html" aria-current="page">Purchase</a>
            <a href="/associates.html">Associates</a>
          </nav>
        </div>
      </header>

      <main className="purchase-main">
        <section className="purchase-intro">
          <p className="purchase-eyebrow">PURCHASE</p>
          <h1>PURCHASE</h1>
          <p>Build a request using the current gold and silver base rates and KorViana denomination markups.</p>
        </section>

        {pricingError && (
          <div role="alert" className="purchase-panel purchase-form-message">
            <p>Prices could not be loaded: {pricingError}</p>
            <button type="button" className="text-action" onClick={() => setPricingState(getLocalMetalPricingState())}>Try again</button>
          </div>
        )}
        {pricing && (
          <section className="purchase-panel" aria-label="Published base rates">
            <div className="purchase-section-heading">
              <div>
                <p className="purchase-eyebrow">BASE RATES</p>
                <h2>Current reference rates</h2>
              </div>
              <span className="purchase-pricing-updated">
                {pricing.updatedAt
                  ? `Updated ${new Date(pricing.updatedAt).toLocaleString('en-IN')}`
                  : 'Starter rates · verify before use'}
              </span>
            </div>
            <p className="purchase-base-rate-note">
              Gold 999: {rupees(pricing.rates.gold)} per 10 grams · Silver 999: {rupees(pricing.rates.silver)} per kilogram.
              KorViana prices include the listed denomination markup; rates are local to this browser and tax treatment has not been verified.
            </p>
          </section>
        )}

        <section className="purchase-panel" aria-labelledby="add-item-heading">
          <div className="purchase-section-heading">
            <div>
              <p className="purchase-eyebrow">YOUR REQUEST</p>
              <h2 id="add-item-heading">Add items</h2>
            </div>
            <span className="request-badge">Purchase request only</span>
          </div>
          <form className="purchase-form" onSubmit={addItem}>
            <div className="purchase-field item-field">
              <label htmlFor="item-type">Item</label>
              <select
                id="item-type"
                value={itemType}
                onChange={(event) => {
                  setItemType(event.target.value)
                  setDenomination('')
                }}
              >
                <option value="Gold">Gold</option>
                <option value="Silver">Silver</option>
              </select>
            </div>
            <div className="purchase-field denomination-field">
              <label htmlFor="denomination">Denomination / Weight</label>
              <input
                id="denomination"
                list="denomination-options"
                value={denomination}
                onChange={(event) => setDenomination(event.target.value)}
                placeholder="Select or enter a denomination"
                autoComplete="off"
              />
              <datalist id="denomination-options">
                {weightsByItem[itemType].map((option) => <option key={option} value={option} />)}
              </datalist>
            </div>
            <div className="purchase-field quantity-field">
              <label htmlFor="quantity">Quantity</label>
              <div className="quantity-control">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  onClick={() => setQuantity(String(Math.max(0, (Number(quantity) || 0) - 1)))}
                >
                  −
                </button>
                <input
                  id="quantity"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
                <button
                  type="button"
                  aria-label="Increase quantity"
                  onClick={() => setQuantity(String((Number(quantity) || 0) + 1))}
                >
                  +
                </button>
              </div>
            </div>
            <button type="submit" className="purchase-primary-button">Add Item</button>
          </form>
          {formMessage && <p className="purchase-form-message" role="alert">{formMessage}</p>}
        </section>

        <section className="purchase-panel" aria-labelledby="purchase-list-heading">
          <div className="purchase-section-heading">
            <div>
              <p className="purchase-eyebrow">ORDER SUMMARY</p>
              <h2 id="purchase-list-heading">Purchase list</h2>
            </div>
            {items.length > 0 && <span className="purchase-count">{items.length} {items.length === 1 ? 'item' : 'items'}</span>}
          </div>

          {items.length === 0 ? (
            <div className="purchase-empty-state">
              <span className="empty-state-mark" aria-hidden="true">+</span>
              <p>No items added yet. Start adding items to your purchase list.</p>
            </div>
          ) : (
            <div className="purchase-table-wrap">
              <table className="purchase-table">
                <thead>
                  <tr>
                    <th scope="col">Sl. No.</th>
                    <th scope="col">Denomination / Weight</th>
                    <th scope="col">Quantity</th>
                    <th scope="col">Price</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id}>
                      <td data-label="Sl. No.">{String(index + 1).padStart(2, '0')}</td>
                      <td data-label="Denomination / Weight">
                        {editingId === item.id ? (
                          <form className="inline-edit-form" onSubmit={saveEdit}>
                            <label className="visually-hidden" htmlFor={`edit-denomination-${item.id}`}>Edit denomination or weight</label>
                            <input
                              id={`edit-denomination-${item.id}`}
                              list="denomination-options"
                              value={editDenomination}
                              onChange={(event) => setEditDenomination(event.target.value)}
                            />
                          </form>
                        ) : item.denomination}
                      </td>
                      <td data-label="Quantity">
                        {editingId === item.id ? (
                          <label className="visually-hidden" htmlFor={`edit-quantity-${item.id}`}>Edit quantity</label>
                        ) : null}
                        {editingId === item.id ? (
                          <input
                            id={`edit-quantity-${item.id}`}
                            className="inline-edit-quantity"
                            type="number"
                            min="0"
                            step="1"
                            value={editQuantity}
                            onChange={(event) => setEditQuantity(event.target.value)}
                          />
                        ) : item.quantity}
                      </td>
                      <td data-label="Price">{linePrices[index] != null ? rupees(linePrices[index]) : '—'}</td>
                      <td data-label="Action">
                        <div className="purchase-row-actions">
                          {editingId === item.id ? (
                            <>
                              <button type="button" className="text-action" onClick={saveEdit}>Save</button>
                              <button type="button" className="text-action muted-action" onClick={() => { setEditingId(null); setFormMessage('') }}>Cancel</button>
                            </>
                          ) : (
                            <button type="button" className="text-action" onClick={() => startEditing(item)}>Edit</button>
                          )}
                          <button type="button" className="text-action remove-action" onClick={() => removeItem(item.id)}>Remove</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {formMessage && items.length > 0 && <p className="purchase-form-message" role="alert">{formMessage}</p>}
        </section>

        <section className="purchase-summary-panel" aria-labelledby="final-summary-heading">
          <div className="summary-title">
            <p className="purchase-eyebrow">READY WHEN YOU ARE</p>
            <h2 id="final-summary-heading">Final purchase summary</h2>
          </div>
          <div className="summary-stats">
            <div><span>Different items</span><strong>{items.length}</strong></div>
            <div><span>Total quantity</span><strong>{totalQuantity}</strong></div>
            {allPriced && <div className="summary-total"><span>Total price</span><strong>{rupees(totalPrice)}</strong></div>}
          </div>
          {items.length > 0 && (
            <ul className="summary-item-list" aria-label="Selected purchase items">
              {items.map((item) => (
                <li key={item.id}><span>{item.denomination}</span><strong>× {item.quantity}{linePrices[items.indexOf(item)] != null ? ` · ${rupees(linePrices[items.indexOf(item)])}` : ''}</strong></li>
              ))}
            </ul>
          )}
          <form onSubmit={submitRequest}>
            <button type="submit" className="purchase-primary-button submit-request-button" disabled={items.length === 0 || !allPriced}>
              Submit Purchase Request
            </button>
          </form>
          {submitMessage && <p className="submit-message" role="status">{submitMessage}</p>}
          <p className="summary-note">Submitting opens an email draft to KorViana. Your request is not an online order or payment.</p>
        </section>
      </main>
      <footer className="purchase-footer">
        <span>KorViana Ventures LLP</span>
        <a href="/">Back to home</a>
      </footer>
    </div>
  )
}

export default PurchasePage
