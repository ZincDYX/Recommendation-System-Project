import { useState } from 'react'
import CartItemCard from '../components/CartItemCard'
import './Cart.css'

function Cart({ items = [], onRemove, onClear }) {
  const [selectedIds, setSelectedIds] = useState([])

  function handleToggleSelect(id) {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((itemId) => itemId !== id)
        : [...prev, id]
    )
  }

  function handleRemove(id) {
    setSelectedIds((prev) => prev.filter((itemId) => itemId !== id))
    onRemove?.(id)
  }

  function handleClear() {
    setSelectedIds([])
    onClear?.()
  }

  const totalPrice = items
    .filter((item) => selectedIds.includes(item.id))
    .reduce((sum, item) => sum + Number(item.price || 0), 0)

  return (
    <div className="cart-page">
      <h1>Watchlist</h1>

      {items.length === 0 && (
        <div className="empty-cart">No movies have been added to the watchlist yet.</div>
      )}

      {items.map((item) => (
        <CartItemCard
          key={item.id}
          item={item}
          selected={selectedIds.includes(item.id)}
          onToggleSelect={handleToggleSelect}
          onRemove={handleRemove}
        />
      ))}

      <div className="cart-summary">
        <span>Total: ¥{totalPrice}</span>
        <button type="button" onClick={handleClear}>Clear</button>
      </div>
    </div>
  )
}

export default Cart
