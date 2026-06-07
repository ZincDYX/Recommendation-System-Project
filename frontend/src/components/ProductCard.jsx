import './ProductCard.css'
import { useNavigate } from 'react-router-dom'

function ProductCard({ product }) {
  const navigate = useNavigate()

  return (
    <div
      className="product-card"
      onClick={() => navigate(`/product/${product.id}`)}
    >
      <div className="product-image">
        <img src={product.image} alt={product.name} />
      </div>

      <div className="product-info">
        <p className="product-category">{product.category}</p>
        <h3 className="product-name">{product.name}</h3>
        <p className="product-desc">{product.description}</p>

        <div className="product-bottom">
          <span className="product-price">¥{product.price}</span>

          <button
            className="cart-btn"
            onClick={(event) => {
              event.stopPropagation()
              console.log('add to cart:', product.id)
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