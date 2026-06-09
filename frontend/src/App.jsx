import './App.css'
import { useEffect, useMemo, useRef, useState } from 'react'

import {
  Navigate,
  Routes,
  Route,
  useNavigate
} from 'react-router-dom'

import ProductCard from './components/ProductCard'
import LoginProfile from './pages/LoginProfile'
import Cart from './pages/Cart'
import ProductDetail from './pages/ProductDetail'

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
  getMovieDetails,
  getRecommendations,
  getSessionRecommendations,
  getUser,
  getUserMetrics,
  getUsers,
} from './api/api'

const DEFAULT_DATASET = 'MovieLens'
const DEFAULT_MODEL = 'ensemble'
const ALL_CATEGORY = 'All'
const CATALOG_PAGE_SIZE = 40
const TESTER_USER_ID = 'tester'
const LOGIN_PASSWORD = '0'
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

function metricClass(rows, metricName, value) {
  const values = rows
    .map((row) => Number(row[metricName] || 0))
    .filter((metricValue) => Number.isFinite(metricValue))
  if (values.length < 2) return ''
  const maxValue = Math.max(...values)
  const minValue = Math.min(...values)
  const minSpread = metricName === 'precision' ? 0.005 : 0.03
  if (maxValue - minValue < minSpread) return ''
  const numericValue = Number(value || 0)
  if (Math.abs(numericValue - maxValue) < 1e-10) return 'metric-high'
  if (Math.abs(numericValue - minValue) < 1e-10) return 'metric-low'
  return ''
}

function modelSummary(row, rows) {
  const sortedByNdcg = [...rows].sort((a, b) => Number(b.ndcg || 0) - Number(a.ndcg || 0))
  const bestModel = sortedByNdcg[0]?.model
  if (row.model === bestModel) return '综合排序质量最好，适合作为最终展示结果。'
  if (row.model === 'content_tfidf') return '只利用标题文本，语义信息有限，通常作为内容基线。'
  if (row.model === 'itemcf') return '可解释性强，但在稀疏数据上容易受共现不足影响。'
  if (row.model === 'popularity') return '热门基线稳定，但个性化能力有限。'
  if (row.model === 'bpr_mf') return '学习用户和物品隐向量，个性化能力较强。'
  if (row.model === 'gru4rec') return '建模行为时序，体现深度序列推荐能力。'
  return '用于对比整体排序表现。'
}

function productKey(product) {
  return String(product.item_id || product.id)
}

function movieDetailKey(dataset, itemId) {
  return `${dataset}:${itemId}`
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
    isLoggedIn: false,
    isTester: false,
    userId: 'guest',
    dataset: DEFAULT_DATASET,
    historyCount: 0,
  })
  const [searchText, setSearchText] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [contextItems, setContextItems] = useState([])
  const [sessionEvents, setSessionEvents] = useState([])
  const [cartItems, setCartItems] = useState([])
  const [catalogCategories, setCatalogCategories] = useState(categories)
  const [catalogProducts, setCatalogProducts] = useState([])
  const [catalogOffset, setCatalogOffset] = useState(0)
  const [catalogHasMore, setCatalogHasMore] = useState(false)
  const [catalogTotal, setCatalogTotal] = useState(0)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogMessage, setCatalogMessage] = useState('Loading real catalog...')
  const [genreMessage, setGenreMessage] = useState('')
  const [movieDetailsById, setMovieDetailsById] = useState({})
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
  const [metricMessage, setMetricMessage] = useState('Run a recommendation to compute user-specific offline metrics.')
  const [overallMetricRows, setOverallMetricRows] = useState({})
  const [experimentMessage, setExperimentMessage] = useState('Load a real dataset user to inspect recommendations.')
  const [experimentLoading, setExperimentLoading] = useState(false)
  const [loginMessage, setLoginMessage] = useState('Use a dataset user ID with password 0, or tester / 0 for an empty account.')
  const [loginLoading, setLoginLoading] = useState(false)

  const navigate = useNavigate()
  const genreFetchesRef = useRef(new Set())
  const storeDataset = profile.dataset || DEFAULT_DATASET
  const storeUserId = profile.isLoggedIn ? profile.userId : 'guest'
  const storeUserLabel = profile.isLoggedIn ? profile.name : 'Guest user'
  const isDatasetUser = profile.isLoggedIn && !profile.isTester

  useEffect(() => {
    // Load catalog metadata; store mode intentionally starts as a cold guest.
    let isMounted = true

    Promise.all([
      getDatasets(),
      getCatalogCategories(),
    ])
      .then((data) => {
        if (!isMounted) return
        const datasetNames = data[0].datasets || [DEFAULT_DATASET]
        const categoryNames = data[1].categories || categories
        setDatasets(datasetNames.length > 0 ? datasetNames : [DEFAULT_DATASET])
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
    ])
      .then(([modelData, userData]) => {
        if (!isMounted) return
        const modelNames = modelData.models || []
        const datasetSamples = SAMPLE_USERS[experimentDataset] || []
        const loggedInDatasetUser = profile.isLoggedIn && !profile.isTester && profile.dataset === experimentDataset
        const loggedInTester = profile.isLoggedIn && profile.isTester && profile.dataset === experimentDataset
        setExperimentModels(modelNames.length > 0 ? modelNames : [DEFAULT_MODEL])
        setExperimentModel(modelNames.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : modelNames[0] || DEFAULT_MODEL)
        setExperimentUserId(
          loggedInTester
            ? ''
            : loggedInDatasetUser
            ? profile.userId
            : datasetSamples[0]?.userId || userData.users?.[0]?.user_id || ''
        )
        setMetricRows([])
        setMetricMessage('Run a recommendation to compute user-specific offline metrics.')
      })
      .catch(() => {
        if (!isMounted) return
        setExperimentMessage('Backend unavailable. Start the API server before using experiment mode.')
      })

    return () => {
      isMounted = false
    }
  }, [experimentDataset, profile.dataset, profile.isLoggedIn, profile.isTester, profile.userId])

  useEffect(() => {
    // Overall summary is dataset-level and does not depend on the selected user.
    let isMounted = true
    Promise.all(
      datasets.map((datasetName) =>
        getMetrics(datasetName, 'pos4', 100, 10)
          .then((metricData) => [datasetName, metricData.metrics || []])
          .catch(() => [datasetName, []])
      )
    ).then((entries) => {
      if (!isMounted) return
      setOverallMetricRows(Object.fromEntries(entries))
    })
    return () => {
      isMounted = false
    }
  }, [datasets])

  useEffect(() => {
    // Storefront recommendations combine immutable dataset history with local session signals.
    const hasSessionSignals = activeQuery || contextItems.length > 0
    if (!hasSessionSignals && !isDatasetUser) {
      setRecommendedProducts([])
      setApiMessage(`${storeUserLabel} · session history ${sessionEvents.length} actions. Click movies or add them to your watchlist to start recommendations.`)
      return
    }

    let isMounted = true
    setIsLoading(true)

    const recommendationRequest = isDatasetUser
      ? getRecommendations({
          dataset: storeDataset,
          userId: storeUserId,
          model: DEFAULT_MODEL,
          topk: 12,
          query: activeQuery,
          contextItems,
        })
      : getSessionRecommendations({
          dataset: storeDataset,
          topk: 12,
          query: activeQuery,
          contextItems,
        })

    recommendationRequest
      .then((data) => {
        if (!isMounted) return
        setRecommendedProducts(data.recommendations || [])
        const historyLabel = isDatasetUser ? `${profile.historyCount} dataset history items` : 'empty dataset history'
        setApiMessage(`${storeUserLabel} · ${historyLabel} · ${sessionEvents.length} session actions. Starred items are ranked first.`)
      })
      .catch(() => {
        if (!isMounted) return
        setRecommendedProducts([])
        setApiMessage('Session recommender unavailable. Showing the real catalog without starred items.')
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [
    activeQuery,
    contextItems,
    isDatasetUser,
    profile.historyCount,
    sessionEvents.length,
    storeDataset,
    storeUserId,
    storeUserLabel,
  ])

  function loadCatalogPage(offset = 0, append = false) {
    setCatalogLoading(true)
    setGenreMessage('')
    return getItems({
      dataset: storeDataset,
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
        setCatalogMessage(`Showing ${data.next_offset || pageItems.length} of ${data.total || pageItems.length} real ${storeDataset} items.`)
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
  }, [activeQuery, selectedCategory, storeDataset])

  useEffect(() => {
    const productsToEnrich = new Map()
    for (const product of [...catalogProducts, ...recommendedProducts]) {
      const dataset = product.dataset || DEFAULT_DATASET
      const itemId = productKey(product)
      const key = movieDetailKey(dataset, itemId)
      if (dataset === DEFAULT_DATASET && !movieDetailsById[key] && !genreFetchesRef.current.has(key)) {
        productsToEnrich.set(key, { dataset, itemId })
      }
    }

    const pending = Array.from(productsToEnrich.values())
    if (pending.length === 0) return

    let isCancelled = false
    let cursor = 0
    let completed = 0
    pending.forEach((item) => {
      genreFetchesRef.current.add(movieDetailKey(item.dataset, item.itemId))
    })
    setGenreMessage(`Updating movie genres for ${pending.length} visible items...`)

    async function worker() {
      while (!isCancelled && cursor < pending.length) {
        const current = pending[cursor]
        cursor += 1
        const key = movieDetailKey(current.dataset, current.itemId)
        try {
          const detail = await getMovieDetails(current.dataset, current.itemId)
          if (!isCancelled) {
            setMovieDetailsById((prev) => ({
              ...prev,
              [key]: detail,
            }))
          }
        } catch {
          // Keep the title-based fallback category when external metadata is unavailable.
        } finally {
          completed += 1
          if (!isCancelled && completed === pending.length) {
            setGenreMessage('')
          }
        }
      }
    }

    const workerCount = Math.min(4, pending.length)
    Array.from({ length: workerCount }, () => worker())

    return () => {
      isCancelled = true
    }
  }, [catalogProducts, recommendedProducts, movieDetailsById])

  function handleSearch(event) {
    event.preventDefault()
    const query = searchText.trim()
    setActiveQuery(query)
    if (query) {
      setSessionEvents((prev) => [
        {
          action: 'search',
          itemId: '',
          title: query,
          timestamp: Date.now(),
        },
        ...prev,
      ])
      syncExperimentToLoggedInUser()
    }
    setSelectedCategory(ALL_CATEGORY)
  }

  function recordSessionItem(product, action) {
    const itemId = product.item_id || product.id
    if (!itemId) return
    setSessionEvents((prev) => [
      {
        action,
        itemId,
        title: product.title || product.name || itemId,
        timestamp: Date.now(),
      },
      ...prev,
    ])
    syncExperimentToLoggedInUser()
    setContextItems((prev) => {
      if (prev.includes(itemId)) return prev
      return [itemId, ...prev].slice(0, 20)
    })
  }

  function recordSessionEvent(product, action) {
    const itemId = product.item_id || product.id
    if (!itemId) return
    setSessionEvents((prev) => [
      {
        action,
        itemId,
        title: product.title || product.name || itemId,
        timestamp: Date.now(),
      },
      ...prev,
    ])
    syncExperimentToLoggedInUser()
  }

  function handleViewProduct(product) {
    recordSessionItem(product, 'view')
    setSelectedCategory(ALL_CATEGORY)
    navigate(`/product/${product.dataset || DEFAULT_DATASET}/${encodeURIComponent(productKey(product))}`)
  }

  function handleAddToCart(product) {
    // The Add button toggles the current session watchlist without changing dataset files.
    const itemId = productKey(product)
    if (cartItems.some((item) => productKey(item) === itemId)) {
      setCartItems((prev) => prev.filter((item) => productKey(item) !== itemId))
      setContextItems((prev) => prev.filter((contextItemId) => contextItemId !== itemId))
      recordSessionEvent(product, 'remove')
      return
    }
    setCartItems((prev) => {
      if (prev.some((item) => productKey(item) === itemId)) return prev
      return [...prev, product]
    })
    recordSessionItem(product, 'add')
    setSelectedCategory(ALL_CATEGORY)
  }

  function handleRemoveFromCart(id) {
    setCartItems((prev) => prev.filter((item) => productKey(item) !== id))
    setContextItems((prev) => prev.filter((itemId) => itemId !== id))
  }

  function handleClearWatchlist(selectedIds = []) {
    const watchlistIds = new Set(selectedIds)
    if (watchlistIds.size === 0) return
    setCartItems((prev) => prev.filter((item) => !watchlistIds.has(productKey(item))))
    setContextItems((prev) => prev.filter((itemId) => !watchlistIds.has(itemId)))
  }

  function handleLoadMore() {
    if (catalogLoading || !catalogHasMore) return
    loadCatalogPage(catalogOffset, true)
  }

  function resetSessionState() {
    setSearchText('')
    setActiveQuery('')
    setContextItems([])
    setSessionEvents([])
    setCartItems([])
    setRecommendedProducts([])
    setSelectedCategory(ALL_CATEGORY)
  }

  function syncExperimentToLoggedInUser() {
    if (!isDatasetUser) return
    setExperimentDataset(profile.dataset)
    setExperimentUserId(profile.userId)
  }

  function handleLogin({ dataset, userId, password }) {
    const normalizedUserId = userId.trim()
    if (!normalizedUserId) {
      setLoginMessage('Enter a user ID before logging in.')
      return
    }
    if (password !== LOGIN_PASSWORD) {
      setLoginMessage('Invalid password. This demo uses password 0 for every account.')
      return
    }

    setLoginLoading(true)
    setLoginMessage('Checking dataset user...')

    if (normalizedUserId.toLowerCase() === TESTER_USER_ID) {
      resetSessionState()
      setProfile((current) => ({
        ...current,
        name: 'tester',
        isLoggedIn: true,
        isTester: true,
        userId: TESTER_USER_ID,
        dataset: DEFAULT_DATASET,
        historyCount: 0,
      }))
      setExperimentDataset(DEFAULT_DATASET)
      setExperimentUserId('')
      setHistoryRows([])
      setExperimentRecommendations([])
      setMetricRows([])
      setMetricMessage('tester has no dataset test cases for offline metrics.')
      setExperimentMessage('tester has no dataset history. Use Store actions to create session context.')
      setLoginMessage('Logged in as tester. This account has no dataset history.')
      setLoginLoading(false)
      return
    }

    getUser(dataset, normalizedUserId)
      .then((account) => {
        resetSessionState()
        setProfile((current) => ({
          ...current,
          name: `User ${account.user_id}`,
          isLoggedIn: true,
          isTester: false,
          userId: account.user_id,
          dataset: account.dataset,
          historyCount: account.history_count,
        }))
        setExperimentDataset(account.dataset)
        setExperimentUserId(account.user_id)
        setHistoryRows([])
        setExperimentRecommendations([])
        setMetricRows([])
        setMetricMessage('Run a recommendation to compute user-specific offline metrics.')
        setExperimentMessage(`Logged in dataset user ${account.user_id}. Run recommendations to inspect this user.`)
        setLoginMessage(`Logged in as ${account.user_id}.`)
      })
      .catch(() => {
        setLoginMessage('Unknown user ID for the selected dataset.')
      })
      .finally(() => setLoginLoading(false))
  }

  function handleLogout() {
    resetSessionState()
    setProfile((current) => ({
      ...current,
      name: 'Guest User',
      isLoggedIn: false,
      isTester: false,
      userId: 'guest',
      dataset: DEFAULT_DATASET,
      historyCount: 0,
    }))
    setExperimentDataset(DEFAULT_DATASET)
    setExperimentUserId('')
    setHistoryRows([])
    setExperimentRecommendations([])
    setMetricRows([])
    setMetricMessage('Run a recommendation to compute user-specific offline metrics.')
    setLoginMessage('Use a dataset user ID with password 0, or tester / 0 for an empty account.')
  }

  function handleSelectSampleUser(sample) {
    setExperimentUserId(sample.userId)
    if (experimentModels.includes(DEFAULT_MODEL)) {
      setExperimentModel(DEFAULT_MODEL)
    }
    setMetricRows([])
    setMetricMessage('Run a recommendation to compute user-specific offline metrics.')
    setExperimentMessage(`Selected sample user ${sample.userId}. Run recommendations to inspect this user.`)
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
        query: activeQuery,
        contextItems,
      }),
      getUserMetrics(experimentDataset, experimentUserId, 'pos4', 100, 10),
    ])
      .then(([historyData, recommendationData, userMetricData]) => {
        setHistoryRows(historyData.history || [])
        setExperimentRecommendations(recommendationData.recommendations || [])
        setMetricRows(userMetricData.metrics || [])
        const caseCount = userMetricData.test_case_count || 0
        setMetricMessage(
          caseCount > 0
            ? `Computed on ${caseCount} positive test case${caseCount === 1 ? '' : 's'} for user ${experimentUserId}.`
            : `No positive test cases found for user ${experimentUserId} under Pos4.`
        )
        setExperimentMessage(`Recommendations generated for user ${experimentUserId}.`)
      })
      .catch((error) => {
        setExperimentMessage(`Could not load recommendations: ${error.message}`)
      })
      .finally(() => setExperimentLoading(false))
  }

  const watchlistItemIds = useMemo(
    () => new Set(cartItems.map((item) => productKey(item))),
    [cartItems]
  )

  const visibleProducts = useMemo(() => {
    const productCategory = (product) => product.displayCategory || product.externalCategory || product.category
    const enrichProduct = (product) => {
      const dataset = product.dataset || DEFAULT_DATASET
      const itemId = productKey(product)
      const detail = movieDetailsById[movieDetailKey(dataset, itemId)]
      if (!detail) return product
      const genres = detail.genres?.length ? detail.genres : product.genres
      const externalCategory = detail.external_found ? detail.category : product.externalCategory
      return {
        ...product,
        genres,
        externalCategory,
        displayCategory: externalCategory || product.displayCategory || product.category,
        genreSource: detail.genre_source || product.genreSource,
        description: detail.external_found ? 'Wikipedia / Wikidata genre' : product.description,
      }
    }
    const enrichedRecommendations = recommendedProducts.map((product) => ({
      ...enrichProduct(product),
      isRecommended: true,
      isInWatchlist: watchlistItemIds.has(productKey(product)),
    }))
    const recommendedMap = new Map(
      enrichedRecommendations.map((product) => [
        productKey(product),
        product,
      ])
    )
    const matchesCategory = (product) => selectedCategory === ALL_CATEGORY || productCategory(product) === selectedCategory
    const rankedRecommendations = enrichedRecommendations.filter(matchesCategory)
    const regularProducts = catalogProducts
      .map(enrichProduct)
      .filter((product) => !recommendedMap.has(productKey(product)))
      .filter(matchesCategory)
      .map((product) => ({
        ...product,
        isRecommended: false,
        isInWatchlist: watchlistItemIds.has(productKey(product)),
      }))
    return [...rankedRecommendations, ...regularProducts]
  }, [catalogProducts, recommendedProducts, selectedCategory, movieDetailsById, watchlistItemIds])
  const sampleUsers = useMemo(() => SAMPLE_USERS[experimentDataset] || [], [experimentDataset])

  return (
    <div className="page">
      <Routes>
        <Route
          path="/"
          element={
            profile.isLoggedIn ? (
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
                  <span>👤</span>
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
                        {genreMessage && <p>{genreMessage}</p>}
                      </div>

                      <div className="recommendation-meta">
                        <span>{storeUserLabel}</span>
                        <span>{storeDataset}</span>
                        <span>{isDatasetUser ? DEFAULT_MODEL : 'session'}</span>
                        {activeQuery && <span>Query: {activeQuery}</span>}
                        <span>{sessionEvents.length} actions</span>
                      </div>
                    </div>

                    {isLoading && <div className="status-line">Refreshing recommendations...</div>}
                    {catalogLoading && <div className="status-line">Loading catalog items...</div>}

                    <div className="product-grid">
                      {visibleProducts.map((product, index) => (
                        <ProductCard
                          key={`${product.id}-${index}`}
                          product={product}
                          onView={handleViewProduct}
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
                        onChange={(event) => {
                          setExperimentDataset(event.target.value)
                          setMetricRows([])
                          setMetricMessage('Run a recommendation to compute user-specific offline metrics.')
                        }}
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
                        onChange={(event) => {
                          setExperimentUserId(event.target.value)
                          setMetricRows([])
                          setMetricMessage('Run a recommendation to compute user-specific offline metrics.')
                        }}
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
                    <h2>Sample Users</h2>
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
                          <span>{sample.historyCount} history records</span>
                          <span>{sample.targetTitle}</span>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="experiment-card metric-guide">
                    <h2>Metric Guide</h2>
                    <div className="metric-guide-list">
                      <p><strong>Algorithm score</strong>：当前算法给出的排序分数，分数越高表示在同一次请求、同一算法下排序越靠前；它不是点击概率。</p>
                      <p><strong>Hit@10 / Recall@10</strong>：衡量真实相关 item 是否出现在 Top-10 中。当前每个测试样本只有一个正例，所以两者数值相同。</p>
                      <p><strong>Precision@10</strong>：Top-10 中相关 item 的占比。当前每个测试样本只有一个正例，所以理论上限是 0.1。</p>
                      <p><strong>NDCG@10</strong>：衡量相关 item 是否排在更靠前的位置，越高说明排序质量越好。</p>
                      <p><strong>MRR@10</strong>：第一个相关结果排名的倒数，越高表示第一个命中结果越靠前。</p>
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
                    <h2>User-Specific Offline Metrics, Pos4, 100 Negatives, K=10</h2>
                    <p className="metric-status">{metricMessage}</p>
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
                      {metricRows.length === 0 && <p className="empty-table">Run a recommendation to compute metrics for the current user.</p>}
                    </div>
                  </section>

                  <section className="experiment-card overall-summary-card">
                    <h2>Overall Algorithm Performance Summary</h2>

                    {datasets.map((datasetName) => {
                      const rows = [...(overallMetricRows[datasetName] || [])]
                        .sort((a, b) => Number(b.ndcg || 0) - Number(a.ndcg || 0))
                      return (
                        <div className="dataset-summary" key={datasetName}>
                          <h3>{datasetName}</h3>
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
                                  <th>Analysis</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((row) => (
                                  <tr key={`${datasetName}-${row.model}`}>
                                    <td>{row.model}</td>
                                    <td className={metricClass(rows, 'hit', row.hit)}>{formatMetric(row.hit)}</td>
                                    <td className={metricClass(rows, 'precision', row.precision)}>{formatMetric(row.precision)}</td>
                                    <td className={metricClass(rows, 'recall', row.recall)}>{formatMetric(row.recall)}</td>
                                    <td className={metricClass(rows, 'ndcg', row.ndcg)}>{formatMetric(row.ndcg)}</td>
                                    <td className={metricClass(rows, 'mrr', row.mrr)}>{formatMetric(row.mrr)}</td>
                                    <td className="summary-analysis">{modelSummary(row, rows)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {rows.length === 0 && <p className="empty-table">No saved metrics found for {datasetName}.</p>}
                          </div>
                        </div>
                      )
                    })}
                  </section>
                </main>
              )}
              </>
            ) : (
              <Navigate to="/profile" replace />
            )
          }
        />

        <Route
          path="/profile"
          element={
            <LoginProfile
              profile={profile}
              setProfile={setProfile}
              sessionEvents={sessionEvents}
              datasets={datasets}
              onLogin={handleLogin}
              onLogout={handleLogout}
              onBrowseMovies={() => navigate('/')}
              loginMessage={loginMessage}
              loginLoading={loginLoading}
            />
          }
        />

        <Route
          path="/cart"
          element={
            <Cart
              items={cartItems}
              onRemove={handleRemoveFromCart}
              onClear={handleClearWatchlist}
            />
          }
        />

        <Route
          path="/product/:dataset/:itemId"
          element={
            <ProductDetail
              watchlistItemIds={watchlistItemIds}
              onAdd={handleAddToCart}
            />
          }
        />
      </Routes>
    </div>
  )
}

export default App
