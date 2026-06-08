import './CartItemCard.css'
import { useNavigate } from 'react-router-dom'

function CartItemCard({
  item,
  selected,
  onToggleSelect,
  onRemove,
}) {
  const navigate = useNavigate()
  const title = String(item.name || item.title || item.item_id || item.id)

  return (
    <div className="cart-item-card">
      <button
        className="cart-item-image"
        onClick={() => navigate(`/product/${item.id}`)}
      >
        {item.image ? (
          <img src={item.image} alt={title} />
        ) : (
          <span>{title.slice(0, 2).toUpperCase()}</span>
        )}
      </button>

      <div className="cart-item-info">
        <h3>{title}</h3>
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
