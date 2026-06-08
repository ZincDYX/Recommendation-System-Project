const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

async function request(path, params = {}) {
  const url = new URL(path, API_BASE_URL)

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    url.searchParams.set(key, value)
  })

  const response = await fetch(url)

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Request failed: ${response.status}`)
  }

  return response.json()
}

export function getDatasets() {
  return request('/datasets')
}

export function getModels(dataset) {
  return request('/models', { dataset })
}

export function getUsers(dataset, limit = 20, query = '') {
  return request('/users', { dataset, limit, query })
}

export function getHistory(dataset, userId, limit = 20) {
  return request('/history', { dataset, user_id: userId, limit })
}

export function searchProducts(dataset, query, limit = 20) {
  return request('/search', { dataset, query, limit })
}

export function getRecommendations({
  dataset,
  userId,
  model,
  topk = 12,
  query = '',
  contextItems = [],
  weights = '',
}) {
  return request('/recommend', {
    dataset,
    user_id: userId,
    model,
    topk,
    query,
    context_items: contextItems.join(','),
    weights,
  })
}

export function getMetrics(dataset, label = 'pos4', negativeCount = 100, k = 10) {
  return request('/metrics', {
    dataset,
    label,
    negative_count: negativeCount,
    k,
  })
}
