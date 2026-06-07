const API_BASE_URL = "http://localhost:8000"

export async function searchProducts(query) {
  // Later: connect to backend API
  // const response = await fetch(`${API_BASE_URL}/search?query=${query}`)
  // return response.json()

  return {
    results: []
  }
}

export async function getRecommendations() {
  // Later: connect to recommendation backend
  return {
    results: []
  }
}