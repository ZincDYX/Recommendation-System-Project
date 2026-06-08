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
  getDatasets,
  getHistory,
  getMetrics,
  getModels,
  getRecommendations,
  getUsers,
} from './api/api'

const DEFAULT_DATASET = 'MovieLens'
const DEFAULT_MODEL = 'ensemble'

function formatMetric(value) {
  return Number(value || 0).toFixed(4)
}

function App() {
  // Store mode keeps the ecommerce shell; experiment mode exposes model details.
  const [mode, setMode] = useState('store')
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
  const [datasets, setDatasets] = useState([DEFAULT_DATASET])
  const [experimentDataset, setExperimentDataset] = useState(DEFAULT_DATASET)
  const [experimentModels, setExperimentModels] = useState([DEFAULT_MODEL])
  const [experimentModel, setExperimentModel] = useState(DEFAULT_MODEL)
  const [experimentUserId, setExperimentUserId] = useState('')
  const [experimentTopK, setExperimentTopK] = useState(10)
  const [historyRows, setHistoryRows] = useState([])
  const [experimentRecommendations, setExperimentRecommendations] = useState([])
  const [metricRows, setMetricRows] = useState([])
  const [experimentMessage, setExperimentMessage] = useState('Load a real dataset user to inspect recommendations.')
  const [experimentLoading, setExperimentLoading] = useState(false)

  const navigate = useNavigate()

  useEffect(() => {
    // Load the first real dataset user for an immediately usable demo.
    let isMounted = true

    Promise.all([
      getDatasets(),
      getUsers(DEFAULT_DATASET, 1),
    ])
      .then((data) => {
        if (!isMounted) return
        const datasetNames = data[0].datasets || [DEFAULT_DATASET]
        const firstUser = data[1].users?.[0]?.user_id || ''
        setDatasets(datasetNames.length > 0 ? datasetNames : [DEFAULT_DATASET])
        setUserId(firstUser)
        setExperimentUserId(firstUser)
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
    // Refresh experiment controls whenever the selected dataset changes.
    let isMounted = true

    Promise.all([
      getModels(experimentDataset),
      getUsers(experimentDataset, 1),
      getMetrics(experimentDataset, 'pos4', 100, 10),
    ])
      .then(([modelData, userData, metricData]) => {
        if (!isMounted) return
        const modelNames = modelData.models || []
        setExperimentModels(modelNames.length > 0 ? modelNames : [DEFAULT_MODEL])
        setExperimentModel(modelNames.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : modelNames[0] || DEFAULT_MODEL)
        setExperimentUserId(userData.users?.[0]?.user_id || '')
        setMetricRows(metricData.metrics || [])
      })
      .catch(() => {
        if (!isMounted) return
        setExperimentMessage('Backend unavailable. Start the API server before using experiment mode.')
      })

    return () => {
      isMounted = false
    }
  }, [experimentDataset])

  useEffect(() => {
    // Storefront recommendations react to search text and cart context.
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
    // Adding a product is treated as a session signal for reranking.
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

  function handleRunExperiment(event) {
    // Experiment mode shows history and recommendations for a chosen real user.
    event.preventDefault()
    if (!experimentUserId) {
      setExperimentMessage('Enter a user ID before running recommendations.')
      return
    }

    setExperimentLoading(true)
    setExperimentMessage('Loading history and recommendations...')

    Promise.all([
      getHistory(experimentDataset, experimentUserId, 20),
      getRecommendations({
        dataset: experimentDataset,
        userId: experimentUserId,
        model: experimentModel,
        topk: experimentTopK,
      }),
      getMetrics(experimentDataset, 'pos4', 100, 10),
    ])
      .then(([historyData, recommendationData, metricData]) => {
        setHistoryRows(historyData.history || [])
        setExperimentRecommendations(recommendationData.recommendations || [])
        setMetricRows(metricData.metrics || [])
        setExperimentMessage(`Recommendations generated for user ${experimentUserId}.`)
      })
      .catch(() => {
        setExperimentMessage('Could not load recommendations. Check backend paths and trained models.')
      })
      .finally(() => setExperimentLoading(false))
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

                  <button
                    className="mode-btn"
                    type="button"
                    onClick={() => setMode((current) => current === 'store' ? 'experiment' : 'store')}
                  >
                    {mode === 'store' ? 'Experiment' : 'Store'}
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

              {mode === 'store' ? (
                <>
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
              ) : (
                <main className="content experiment-content">
                  <div className="recommendation-toolbar">
                    <div>
                      <h1>Experiment Mode</h1>
                      <p>{experimentMessage}</p>
                    </div>

                    <div className="recommendation-meta">
                      <span>Precision@10</span>
                      <span>Recall@10</span>
                      <span>NDCG@10</span>
                      <span>MRR@10</span>
                    </div>
                  </div>

                  <form className="experiment-panel" onSubmit={handleRunExperiment}>
                    <label>
                      Dataset
                      <select
                        value={experimentDataset}
                        onChange={(event) => setExperimentDataset(event.target.value)}
                      >
                        {datasets.map((dataset) => (
                          <option key={dataset} value={dataset}>{dataset}</option>
                        ))}
                      </select>
                    </label>

                    <label>
                      User ID
                      <input
                        value={experimentUserId}
                        onChange={(event) => setExperimentUserId(event.target.value)}
                        placeholder="Enter a dataset user id"
                      />
                    </label>

                    <label>
                      Algorithm
                      <select
                        value={experimentModel}
                        onChange={(event) => setExperimentModel(event.target.value)}
                      >
                        {experimentModels.map((modelName) => (
                          <option key={modelName} value={modelName}>{modelName}</option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Top-K
                      <input
                        type="number"
                        min="5"
                        max="50"
                        step="5"
                        value={experimentTopK}
                        onChange={(event) => setExperimentTopK(Number(event.target.value))}
                      />
                    </label>

                    <button className="run-btn" disabled={experimentLoading}>
                      {experimentLoading ? 'Running...' : 'Run Recommendation'}
                    </button>
                  </form>

                  <div className="experiment-grid">
                    <section className="experiment-card">
                      <h2>Training History</h2>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Item</th>
                              <th>Title</th>
                              <th>Rating</th>
                              <th>Timestamp</th>
                            </tr>
                          </thead>
                          <tbody>
                            {historyRows.map((item) => (
                              <tr key={`${item.item_id}-${item.timestamp}`}>
                                <td>{item.item_id}</td>
                                <td>{item.title || item.name}</td>
                                <td>{item.rating}</td>
                                <td>{item.timestamp}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {historyRows.length === 0 && <p className="empty-table">Run a recommendation to load history.</p>}
                      </div>
                    </section>

                    <section className="experiment-card">
                      <h2>Recommendations</h2>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Rank</th>
                              <th>Item</th>
                              <th>Title</th>
                              <th>Score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {experimentRecommendations.map((item) => (
                              <tr key={`${item.rank}-${item.item_id}`}>
                                <td>{item.rank}</td>
                                <td>{item.item_id}</td>
                                <td>{item.title || item.name}</td>
                                <td>{formatMetric(item.score)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {experimentRecommendations.length === 0 && <p className="empty-table">No recommendations loaded yet.</p>}
                      </div>
                    </section>
                  </div>

                  <section className="experiment-card">
                    <h2>Offline Metrics, Pos4, 100 Negatives, K=10</h2>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Model</th>
                            <th>Hit@10</th>
                            <th>Precision@10</th>
                            <th>Recall@10</th>
                            <th>NDCG@10</th>
                            <th>MRR@10</th>
                          </tr>
                        </thead>
                        <tbody>
                          {metricRows.map((row) => (
                            <tr key={row.model}>
                              <td>{row.model}</td>
                              <td>{formatMetric(row.hit)}</td>
                              <td>{formatMetric(row.precision)}</td>
                              <td>{formatMetric(row.recall)}</td>
                              <td>{formatMetric(row.ndcg)}</td>
                              <td>{formatMetric(row.mrr)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </main>
              )}
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
