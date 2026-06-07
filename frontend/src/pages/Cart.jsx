import { useState } from 'react'
import { products } from '../data/products'
import CartItemCard from '../components/CartItemCard'
import './Cart.css'

function Cart() {
  const [selectedIds, setSelectedIds] = useState([])

  function handleToggleSelect(id) {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((itemId) => itemId !== id)
        : [...prev, id]
    )
  }

  function handleRemove(id) {
    console.log('remove item:', id)
    // later: remove from cart state or backend
  }

  const totalPrice = products
    .filter((item) => selectedIds.includes(item.id))
    .reduce((sum, item) => sum + item.price, 0)

  return (
    <div className="cart-page">
      <h1>Shopping Cart</h1>

      {products.map((item) => (
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