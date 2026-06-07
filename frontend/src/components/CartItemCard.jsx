import './CartItemCard.css'
import { useNavigate } from 'react-router-dom'

function CartItemCard({
  item,
  selected,
  onToggleSelect,
  onRemove,
}) {
  const navigate = useNavigate()

  return (
    <div className="cart-item-card">
      <button
        className="cart-item-image"
        onClick={() => navigate(`/product/${item.id}`)}
      >
        <img src={item.image} alt={item.name} />
      </button>

      <div className="cart-item-info">
        <h3>{item.name}</h3>
        <p>¥{item.price}</p>
      </div>

      <button
        className={selected ? 'select-btn selected' : 'select-btn'}
        onClick={() => onToggleSelect(item.id)}
      >
        Select
      </button>

      <button
        className="remove-btn"
        onClick={() => onRemove(item.id)}
      >
        Remove
      </button>
    </div>
  )
}

export default CartItemCard