import { useState } from 'react'
import CartItemCard from '../components/CartItemCard'
import './Cart.css'

function Cart({ items = [], onRemove }) {
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

  const totalPrice = items
    .filter((item) => selectedIds.includes(item.id))
    .reduce((sum, item) => sum + Number(item.price || 0), 0)

  return (
    <div className="cart-page">
      <h1>Shopping Cart</h1>

      {items.length === 0 && (
        <div className="empty-cart">No items have been added yet.</div>
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
        <button>Checkout</button>
      </div>
    </div>
  )
}

export default Cart
