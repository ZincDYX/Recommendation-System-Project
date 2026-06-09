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
  getCatalogCategories,
  getDatasets,
  getHistory,
  getItems,
  getMetrics,
  getModels,
  getRecommendations,
  getUsers,
} from './api/api'

const DEFAULT_DATASET = 'MovieLens'
const DEFAULT_MODEL = 'ensemble'
const ALL_CATEGORY = 'All'
const CATALOG_PAGE_SIZE = 40
const SAMPLE_USERS = {
  MovieLens: [
    {
      userId: '49305',
      historyCount: 7486,
      targetRank: 1,
      targetTitle: 'Grand Budapest Hotel, The (2014)',
    },
    {
      userId: '43703',
      historyCount: 5782,
      targetRank: 1,
      targetTitle: 'Léon: The Professional (1994)',
    },
    {
      userId: '32466',
      historyCount: 4109,
      targetRank: 1,
      targetTitle: 'Supercop (1992)',
    },
    {
      userId: '21011',
      historyCount: 3579,
      targetRank: 1,
      targetTitle: 'Parasite (2019)',
    },
  ],
  Movies_and_TV: [
    {
      userId: 'A328S9RN3U5M68',
      historyCount: 2060,
      targetRank: 1,
      targetTitle: 'Thor: The Dark World (Blu-ray)',
    },
    {
      userId: 'A3LZGLA88K0LA0',
      historyCount: 1688,
      targetRank: 1,
      targetTitle: 'A Christmas Carol VHS',
    },
    {
      userId: 'ANCOMAI0I7LVG',
      historyCount: 1653,
      targetRank: 1,
      targetTitle: 'Ant-Man',
    },
    {
      userId: 'A19ZXK9HHVRV1X',
      historyCount: 1315,
      targetRank: 1,
      targetTitle: 'Under The Skin 2014',
    },
  ],
}

function formatMetric(value) {
  return Number(value || 0).toFixed(4)
}

function productKey(product) {
  return String(product.item_id || product.id)
}

function fallbackCatalog(category, query) {
  const normalizedQuery = query.trim().toLowerCase()
  return products.filter((product) => {
    const matchesCategory = category === ALL_CATEGORY || product.category === category
    const title = String(product.title || product.name || '').toLowerCase()
    const matchesQuery = !normalizedQuery || title.includes(normalizedQuery)
    return matchesCategory && matchesQuery
  })
}

function App() {
  // Store mode keeps the ecommerce shell; experiment mode exposes model details.
  const [mode, setMode] = useState('store')
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORY)
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
  const [catalogCategories, setCatalogCategories] = useState(categories)
  const [catalogProducts, setCatalogProducts] = useState([])
  const [catalogOffset, setCatalogOffset] = useState(0)
  const [catalogHasMore, setCatalogHasMore] = useState(false)
  const [catalogTotal, setCatalogTotal] = useState(0)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogMessage, setCatalogMessage] = useState('Loading real catalog...')
  const [recommendedProducts, setRecommendedProducts] = useState([])
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
      getCatalogCategories(),
    ])
      .then((data) => {
        if (!isMounted) return
        const datasetNames = data[0].datasets || [DEFAULT_DATASET]
        const firstUser = data[1].users?.[0]?.user_id || ''
        const categoryNames = data[2].categories || categories
        setDatasets(datasetNames.length > 0 ? datasetNames : [DEFAULT_DATASET])
        setUserId(firstUser)
        setExperimentUserId(firstUser)
        setCatalogCategories(categoryNames.length > 0 ? categoryNames : categories)
        setSelectedCategory((current) => categoryNames.includes(current) ? current : ALL_CATEGORY)
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
        const datasetSamples = SAMPLE_USERS[experimentDataset] || []
        setExperimentModels(modelNames.length > 0 ? modelNames : [DEFAULT_MODEL])
        setExperimentModel(modelNames.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : modelNames[0] || DEFAULT_MODEL)
        setExperimentUserId(datasetSamples[0]?.userId || userData.users?.[0]?.user_id || '')
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
        setApiMessage(`Recommendations for user ${userId}. Starred items are ranked first.`)
      })
      .catch(() => {
        if (!isMounted) return
        setRecommendedProducts([])
        setApiMessage('Backend unavailable. Showing local fallback products.')
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [activeQuery, contextItems, userId])

  function loadCatalogPage(offset = 0, append = false) {
    setCatalogLoading(true)
    return getItems({
      dataset: DEFAULT_DATASET,
      category: selectedCategory,
      limit: CATALOG_PAGE_SIZE,
      offset,
      query: activeQuery,
    })
      .then((data) => {
        const pageItems = data.items || []
        setCatalogProducts((prev) => append ? [...prev, ...pageItems] : pageItems)
        setCatalogOffset(data.next_offset || 0)
        setCatalogHasMore(Boolean(data.has_more))
        setCatalogTotal(data.total || 0)
        setCatalogMessage(`Showing ${data.next_offset || pageItems.length} of ${data.total || pageItems.length} real ${DEFAULT_DATASET} items.`)
      })
      .catch(() => {
        const fallbackItems = fallbackCatalog(selectedCategory, activeQuery)
        setCatalogProducts(fallbackItems)
        setCatalogOffset(fallbackItems.length)
        setCatalogHasMore(false)
        setCatalogTotal(fallbackItems.length)
        setCatalogMessage('Backend catalog unavailable. Showing local fallback items.')
      })
      .finally(() => setCatalogLoading(false))
  }

  useEffect(() => {
    loadCatalogPage(0, false)
  }, [activeQuery, selectedCategory])

  function handleSearch(event) {
    event.preventDefault()
    setActiveQuery(searchText.trim())
    setSelectedCategory(ALL_CATEGORY)
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
    setSelectedCategory(ALL_CATEGORY)
  }

  function handleRemoveFromCart(id) {
    setCartItems((prev) => prev.filter((item) => item.id !== id))
    setContextItems((prev) => prev.filter((itemId) => itemId !== id))
  }

  function handleLoadMore() {
    if (catalogLoading || !catalogHasMore) return
    loadCatalogPage(catalogOffset, true)
  }

  function handleSelectSampleUser(sample) {
    setExperimentUserId(sample.userId)
    if (experimentModels.includes(DEFAULT_MODEL)) {
      setExperimentModel(DEFAULT_MODEL)
    }
    setExperimentMessage(`已选择示例用户 ${sample.userId}，可直接运行推荐。`)
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
    const recommendedMap = new Map(
      recommendedProducts.map((product) => [
        productKey(product),
        {
          ...product,
          isRecommended: true,
        },
      ])
    )
    const matchesCategory = (product) => selectedCategory === ALL_CATEGORY || product.category === selectedCategory
    const rankedRecommendations = Array.from(recommendedMap.values()).filter(matchesCategory)
    const regularProducts = catalogProducts
      .filter((product) => !recommendedMap.has(productKey(product)))
      .map((product) => ({
        ...product,
        isRecommended: false,
      }))
    return [...rankedRecommendations, ...regularProducts]
  }, [catalogProducts, recommendedProducts, selectedCategory])
  const sampleUsers = useMemo(() => SAMPLE_USERS[experimentDataset] || [], [experimentDataset])

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
                    {catalogCategories.map((item) => (
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
                        <p>{catalogMessage}</p>
                      </div>

                      <div className="recommendation-meta">
                        <span>{DEFAULT_DATASET}</span>
                        <span>{DEFAULT_MODEL}</span>
                        {activeQuery && <span>Query: {activeQuery}</span>}
                        {contextItems.length > 0 && <span>{contextItems.length} cart signals</span>}
                      </div>
                    </div>

                    {isLoading && <div className="status-line">Refreshing recommendations...</div>}
                    {catalogLoading && <div className="status-line">Loading catalog items...</div>}

                    <div className="product-grid">
                      {visibleProducts.map((product, index) => (
                        <ProductCard
                          key={`${product.id}-${index}`}
                          product={product}
                          onAdd={handleAddToCart}
                        />
                      ))}
                    </div>
                    {visibleProducts.length === 0 && (
                      <div className="empty-card">No catalog items found.</div>
                    )}
                    {catalogHasMore && (
                      <button
                        className="load-more-btn"
                        type="button"
                        disabled={catalogLoading}
                        onClick={handleLoadMore}
                      >
                        {catalogLoading ? 'Loading...' : `Load more (${catalogTotal - catalogOffset} left)`}
                      </button>
                    )}
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

                  <section className="experiment-card sample-user-card">
                    <h2>选择示例用户</h2>
                    <div className="sample-user-grid">
                      {sampleUsers.map((sample) => (
                        <button
                          key={sample.userId}
                          type="button"
                          className={
                            experimentUserId === sample.userId
                              ? 'sample-user-btn active'
                              : 'sample-user-btn'
                          }
                          onClick={() => handleSelectSampleUser(sample)}
                        >
                          <span className="sample-user-id">{sample.userId}</span>
                          <span>历史行为 {sample.historyCount} 条</span>
                          <span>{sample.targetTitle}</span>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="experiment-card metric-guide">
                    <h2>数值说明</h2>
                    <div className="metric-guide-list">
                      <p><strong>Algorithm score</strong>：当前算法给出的排序分数，分数越高表示在同一次请求、同一算法下排序越靠前；它不是点击概率。</p>
                      <p><strong>Hit@10 / Recall@10</strong>：当前 leave-one-out 评测中，Top-10 命中唯一正例即为 1，否则为 0，因此两者数值相同。</p>
                      <p><strong>Precision@10</strong>：Top-10 中正例占比；当前协议每个样本只有 1 个正例，所以理论上限是 0.1。</p>
                      <p><strong>NDCG@10</strong>：衡量相关物品是否排在更靠前的位置，越高说明排序质量越好。</p>
                      <p><strong>MRR@10</strong>：关注第一个相关结果出现的位置，越靠前分数越高。</p>
                    </div>
                  </section>

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
                              <th>Algorithm Score</th>
                              <th>推荐理由</th>
                            </tr>
                          </thead>
                          <tbody>
                            {experimentRecommendations.map((item) => (
                              <tr key={`${item.rank}-${item.item_id}`}>
                                <td>{item.rank}</td>
                                <td>{item.item_id}</td>
                                <td>{item.title || item.name}</td>
                                <td>{item.score_label || formatMetric(item.score)}</td>
                                <td className="reason-cell">{item.reason || '暂无推荐理由'}</td>
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
