import { useState } from 'react'
import CartItemCard from '../components/CartItemCard'
import './Cart.css'

function Cart({ items = [], onRemove, onClear }) {
  const [selectedIds, setSelectedIds] = useState([])
  const itemKey = (item) => String(item.item_id || item.id)

  function handleToggleSelect(id) {
    const normalizedId = String(id)
    setSelectedIds((prev) =>
      prev.includes(normalizedId)
        ? prev.filter((itemId) => itemId !== normalizedId)
        : [...prev, normalizedId]
    )
  }

  function handleRemove(id) {
    const normalizedId = String(id)
    setSelectedIds((prev) => prev.filter((itemId) => itemId !== normalizedId))
    onRemove?.(id)
  }

  function handleClear() {
    if (selectedIds.length === 0) return
    onClear?.(selectedIds)
    setSelectedIds([])
  }

  return (
    <div className="cart-page">
      <h1>Watchlist</h1>

      {items.length === 0 && (
        <div className="empty-cart">No movies have been added to the watchlist yet.</div>
      )}

      {items.map((item) => (
        <CartItemCard
          key={itemKey(item)}
          item={item}
          selected={selectedIds.includes(itemKey(item))}
          onToggleSelect={handleToggleSelect}
          onRemove={handleRemove}
        />
      ))}

      <div className="cart-summary">
        <span>{selectedIds.length} selected · {items.length} in watchlist</span>
        <button type="button" disabled={selectedIds.length === 0} onClick={handleClear}>
          Clear Selected
        </button>
      </div>
    </div>
  )
}

export default Cart
