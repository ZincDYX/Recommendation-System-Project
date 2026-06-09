import './ProductCard.css'

function ProductCard({ product, onAdd, onView }) {
  const title = String(product.name || product.title || product.item_id || product.id)
  const genreLabel = product.displayCategory || product.externalCategory || product.category || 'Other'
  const ratingLabel = product.avg_rating
    ? `★ ${Number(product.avg_rating).toFixed(2)}`
    : 'No rating'
  const isInWatchlist = Boolean(product.isInWatchlist)

  return (
    <div
      className="product-card"
      onClick={() => onView?.(product)}
    >
      {product.isRecommended && (
        <span className="recommended-star" aria-label="Recommended" title="Recommended">
          ★
        </span>
      )}

      <div className="product-image">
        {product.image ? (
          <img src={product.image} alt={title} />
        ) : (
          <span>{title.slice(0, 2).toUpperCase()}</span>
        )}
      </div>

      <div className="product-info">
        <p className="product-category">{genreLabel}</p>
        <h3 className="product-name">{title}</h3>
        <p className="product-desc">{product.description}</p>
        {product.score !== undefined && (
          <p className="product-score">
            {product.score_label || `Algorithm score: ${Number(product.score).toFixed(4)}`}
          </p>
        )}
        {product.reason && (
          <p className="product-reason">{product.reason}</p>
        )}

        <div className="product-bottom">
          <span className="product-rating">{ratingLabel}</span>

          <button
            className={isInWatchlist ? 'cart-btn added' : 'cart-btn'}
            aria-pressed={isInWatchlist}
            onClick={(event) => {
              event.stopPropagation()
              onAdd?.(product)
            }}
          >
            {isInWatchlist ? 'Added' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ProductCard
