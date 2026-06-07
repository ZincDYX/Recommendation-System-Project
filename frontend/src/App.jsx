import './App.css'
import { useState } from 'react'

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

function App() {

  const [selectedCategory, setSelectedCategory] =
    useState('Recommended')

  const navigate = useNavigate()

  const [profile, setProfile] = useState({
    name: 'Guest User',
    address: 'Beijing, China',
    avatar: '',
  })

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

              <div className="search-wrapper">
                <input
                  className="search-box"
                  placeholder="Search products..."
                />

                <button className="search-btn">
                  Search
                </button>
              </div>

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
              <h1>{selectedCategory}</h1>

              <div className="product-grid">
                {products.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
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
        element={<Cart />}
      />
    </Routes>
  </div>
)}

export default App