import './ProductCard.css'
import { useNavigate } from 'react-router-dom'

function ProductCard({ product, onAdd }) {
  const navigate = useNavigate()
  const title = String(product.name || product.title || product.item_id || product.id)

  return (
    <div
      className="product-card"
      onClick={() => navigate(`/product/${product.id}`)}
    >
      <div className="product-image">
        {product.image ? (
          <img src={product.image} alt={title} />
        ) : (
          <span>{title.slice(0, 2).toUpperCase()}</span>
        )}
      </div>

      <div className="product-info">
        <p className="product-category">{product.category}</p>
        <h3 className="product-name">{title}</h3>
        <p className="product-desc">{product.description}</p>
        {product.score !== undefined && (
          <p className="product-score">Score {Number(product.score).toFixed(4)}</p>
        )}

        <div className="product-bottom">
          <span className="product-price">¥{product.price}</span>

          <button
            className="cart-btn"
            onClick={(event) => {
              event.stopPropagation()
              onAdd?.(product)
            }}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  )
}

export default ProductCard
