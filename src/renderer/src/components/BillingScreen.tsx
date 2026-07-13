import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBilling } from '../hooks/useBilling'
import { ShiftModal } from './ShiftModal'
import type { useToasts } from '../hooks/useToasts'

type Toasts = ReturnType<typeof useToasts>

export function BillingScreen({ toasts }: { toasts: Toasts }) {
  const { t } = useTranslation()
  const billing = useBilling(toasts)
  const [shiftModalOpen, setShiftModalOpen] = useState(false)

  // If till reconciliation is on and no open shift, prompt to open one
  useEffect(() => {
    if (
      billing.settings.tillReconciliationEnabled === 'true' &&
      !billing.openShiftId
    ) {
      setShiftModalOpen(true)
    }
  }, [billing.settings.tillReconciliationEnabled, billing.openShiftId])

  const stockClass = (qty: number, threshold = 5) =>
    qty <= 0 ? 'out' : qty <= threshold ? 'low' : 'ok'

  return (
    <div className="billing-layout">
      {/* Category bar */}
      <div className="category-bar">
        <button
          className={`category-chip ${billing.activeCategory === null ? 'active' : ''}`}
          onClick={() => billing.setActiveCategory(null)}
        >
          {t('billing.allItems')}
        </button>
        {billing.categories.map((c) => (
          <button
            key={c.id}
            className={`category-chip ${billing.activeCategory === c.id ? 'active' : ''}`}
            onClick={() => billing.setActiveCategory(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="billing-panels">
        {/* Items panel */}
        <div className="items-panel">
          <div className="items-grid">
            {billing.products.map((p) => {
              const stock = billing.stockMap[p.id] ?? 0
              return (
                <button
                  key={p.id}
                  className="item-card"
                  onClick={() => billing.addToCart(p)}
                  disabled={stock <= 0}
                >
                  <div className="item-name">{p.name}</div>
                  <div className="item-price">Rs {p.defaultPrice.toFixed(2)}</div>
                  <div className="item-meta">
                    <span>{p.unitType === 'thaan' ? 'per meter' : 'per piece'}</span>
                    <span className={`stock-badge ${stockClass(stock, p.lowStockThreshold)}`}>
                      {stock} {p.unitType === 'thaan' ? 'm' : 'pcs'}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Cart panel */}
        <aside className="cart-panel">
          <div className="cart-header">
            <h2>{t('billing.cart')} ({billing.cart.length})</h2>
            {billing.cart.length > 0 && (
              <button className="cart-clear" onClick={billing.clearCart}>
                {t('billing.clearCart')}
              </button>
            )}
          </div>

          <div className="cart-items">
            {billing.cart.length === 0 ? (
              <div className="cart-empty">
                <div style={{ fontSize: 40 }}>🛒</div>
                <p>{t('billing.empty')}</p>
              </div>
            ) : (
              billing.cart.map((line) => (
                <div key={line.productId} className="cart-item">
                  <div className="cart-item-row">
                    <span className="cart-item-name">{line.name}</span>
                    <button
                      className="cart-item-remove"
                      onClick={() => billing.removeFromCart(line.productId)}
                      aria-label="remove"
                    >
                      ×
                    </button>
                  </div>
                  <div className="cart-item-controls">
                    <button
                      className="qty-btn"
                      onClick={() =>
                        billing.updateLine(line.productId, {
                          quantity: Math.max(1, line.quantity - 1)
                        })
                      }
                    >
                      −
                    </button>
                    <span className="qty-display">
                      {line.quantity}
                      {line.unitType === 'thaan' ? 'm' : 'x'}
                    </span>
                    <button
                      className="qty-btn"
                      onClick={() =>
                        billing.updateLine(line.productId, {
                          quantity: Math.min(line.stock, line.quantity + 1)
                        })
                      }
                    >
                      +
                    </button>
                    <input
                      className="price-input"
                      type="number"
                      step="0.01"
                      value={line.price}
                      onChange={(e) =>
                        billing.updateLine(line.productId, {
                          price: parseFloat(e.target.value) || 0
                        })
                      }
                      aria-label={t('billing.price')}
                    />
                  </div>
                  {line.unitType === 'thaan' && (
                    <div className="cart-item-controls" style={{ gridTemplateColumns: '1fr auto' }}>
                      <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {t('billing.cutLength')}
                      </label>
                      <input
                        className="cut-length-input"
                        type="number"
                        step="0.1"
                        value={line.cutLength ?? ''}
                        onChange={(e) =>
                          billing.updateLine(line.productId, {
                            cutLength: parseFloat(e.target.value) || 0
                          })
                        }
                      />
                    </div>
                  )}
                  <div className="cart-item-row">
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {t('billing.stock')}: {line.stock}
                    </span>
                    <span className="cart-item-line-total">Rs {line.lineTotal.toFixed(2)}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="cart-footer">
            <div className="cart-total-row">
              <span className="label">{t('billing.subtotal')}</span>
              <span className="value">Rs {billing.subtotal.toFixed(2)}</span>
            </div>

            <div className="payment-method-group">
              <button
                className={`payment-btn ${billing.paymentMethod === 'cash' ? 'active' : ''}`}
                onClick={() => billing.setPaymentMethod('cash')}
              >
                {t('billing.cash')}
              </button>
              <button
                className={`payment-btn ${billing.paymentMethod === 'digital' ? 'active' : ''}`}
                onClick={() => billing.setPaymentMethod('digital')}
              >
                {t('billing.digital')}
              </button>
            </div>

            <div className="cart-total-row">
              <span className="label">{t('billing.paid')}</span>
              <input
                className="price-input"
                type="number"
                step="0.01"
                placeholder={billing.subtotal.toFixed(2)}
                value={billing.paidAmount}
                onChange={(e) => billing.setPaidAmount(e.target.value)}
                style={{ maxWidth: 120, textAlign: 'right' }}
              />
            </div>

            <div className="cart-total-row grand">
              <span className="label">{t('billing.total')}</span>
              <span className="value">Rs {billing.subtotal.toFixed(2)}</span>
            </div>

            <button
              className="confirm-btn"
              onClick={billing.confirmSale}
              disabled={billing.submitting || billing.cart.length === 0}
            >
              {billing.submitting ? t('billing.confirming') : t('billing.confirm')}
            </button>

            <button className="btn" onClick={billing.reprintLast}>
              {t('billing.reprint')}
            </button>
          </div>
        </aside>
      </div>

      {shiftModalOpen && billing.settings.tillReconciliationEnabled === 'true' && (
        <ShiftModal
          mode="open"
          onClose={() => setShiftModalOpen(false)}
          onDone={async () => {
            await billing.refreshOpenShift()
            setShiftModalOpen(false)
          }}
          toasts={toasts}
        />
      )}
    </div>
  )
}
