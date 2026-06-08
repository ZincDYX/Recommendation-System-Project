import './App.css'
import { useEffect, useMemo, useState } from 'react'

import {
  Routes,
  Route,
  useNavigate
} from 'react-router-dom'

import ProductCard from './components/ProductCard'
import LoginProfile from './pages/LoginProfile'
import Cart from './pages/Cart'

import {
  products,
  categories
} from './data/products'

import {
  getRecommendations,
  getUsers,
} from './api/api'

const DEFAULT_DATASET = 'MovieLens'
const DEFAULT_MODEL = 'ensemble'

function App() {
  const [selectedCategory, setSelectedCategory] = useState('Recommended')
  const [profile, setProfile] = useState({
    name: 'Guest User',
    address: 'Beijing, China',
    avatar: '',
  })
  const [userId, setUserId] = useState('')
  const [searchText, setSearchText] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [contextItems, setContextItems] = useState([])
  const [cartItems, setCartItems] = useState([])
  const [recommendedProducts, setRecommendedProducts] = useState(products)
  const [apiMessage, setApiMessage] = useState('Connecting recommendation backend...')
  const [isLoading, setIsLoading] = useState(false)

  const navigate = useNavigate()

  useEffect(() => {
    let isMounted = true

    getUsers(DEFAULT_DATASET, 1)
      .then((data) => {
        if (!isMounted) return
        const firstUser = data.users?.[0]?.user_id || ''
        setUserId(firstUser)
      })
      .catch(() => {
        if (!isMounted) return
        setApiMessage('Backend unavailable. Showing local fallback products.')
      })

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (!userId) return

    let isMounted = true
    setIsLoading(true)

    getRecommendations({
      dataset: DEFAULT_DATASET,
      userId,
      model: DEFAULT_MODEL,
      topk: 12,
      query: activeQuery,
      contextItems,
    })
      .then((data) => {
        if (!isMounted) return
        setRecommendedProducts(data.recommendations || [])
        setApiMessage(`Recommendations for user ${userId}`)
      })
      .catch(() => {
        if (!isMounted) return
        setRecommendedProducts(products)
        setApiMessage('Backend unavailable. Showing local fallback products.')
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [activeQuery, contextItems, userId])

  function handleSearch(event) {
    event.preventDefault()
    setActiveQuery(searchText.trim())
    setSelectedCategory('Recommended')
  }

  function handleAddToCart(product) {
    const itemId = product.item_id || product.id
    setCartItems((prev) => {
      if (prev.some((item) => item.id === product.id)) return prev
      return [...prev, product]
    })
    setContextItems((prev) => {
      if (!itemId || prev.includes(itemId)) return prev
      return [...prev, itemId]
    })
    setSelectedCategory('Recommended')
  }

  function handleRemoveFromCart(id) {
    setCartItems((prev) => prev.filter((item) => item.id !== id))
    setContextItems((prev) => prev.filter((itemId) => itemId !== id))
  }

  const visibleProducts = useMemo(() => {
    if (selectedCategory === 'Recommended') return recommendedProducts
    return products.filter((product) => product.category === selectedCategory)
  }, [recommendedProducts, selectedCategory])

  return (
    <div className="page">
      <Routes>
        <Route
          path="/"
          element={
            <>
              <header className="header">
                <button
                  className="icon-btn"
                  onClick={() => navigate('/cart')}
                >
                  🛒
                </button>

                <form className="search-wrapper" onSubmit={handleSearch}>
                  <input
                    className="search-box"
                    placeholder="Search products..."
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                  />

                  <button className="search-btn">
                    Search
                  </button>
                </form>

                <button
                  className="avatar-btn"
                  onClick={() => navigate('/profile')}
                >
                  {profile.avatar ? (
                    <img src={profile.avatar} alt="profile" />
                  ) : (
                    <span>👤</span>
                  )}
                </button>
              </header>

              <nav className="category-scroll">
                {categories.map((item) => (
                  <button
                    key={item}
                    className={
                      selectedCategory === item
                        ? 'category-btn active'
                        : 'category-btn'
                    }
                    onClick={() => setSelectedCategory(item)}
                  >
                    {item}
                  </button>
                ))}
              </nav>

              <main className="content">
                <div className="recommendation-toolbar">
                  <div>
                    <h1>{selectedCategory}</h1>
                    <p>{apiMessage}</p>
                  </div>

                  <div className="recommendation-meta">
                    <span>{DEFAULT_DATASET}</span>
                    <span>{DEFAULT_MODEL}</span>
                    {activeQuery && <span>Query: {activeQuery}</span>}
                    {contextItems.length > 0 && <span>{contextItems.length} cart signals</span>}
                  </div>
                </div>

                {isLoading && <div className="status-line">Refreshing recommendations...</div>}

                <div className="product-grid">
                  {visibleProducts.map((product, index) => (
                    <ProductCard
                      key={`${product.id}-${index}`}
                      product={product}
                      onAdd={handleAddToCart}
                    />
                  ))}
                </div>
              </main>
            </>
          }
        />

        <Route
          path="/profile"
          element={
            <LoginProfile
              profile={profile}
              setProfile={setProfile}
            />
          }
        />

        <Route
          path="/cart"
          element={
            <Cart
              items={cartItems}
              onRemove={handleRemoveFromCart}
            />
          }
        />
      </Routes>
    </div>
  )
}

export default App
