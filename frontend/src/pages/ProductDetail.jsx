import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getMovieDetails } from '../api/api'
import './ProductDetail.css'

function ProductDetail({ onAdd }) {
  const navigate = useNavigate()
  const { dataset = 'MovieLens', itemId = '' } = useParams()
  const decodedItemId = decodeURIComponent(itemId)
  const [detail, setDetail] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState('Loading movie details...')

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    setMessage('Loading movie details...')

    getMovieDetails(dataset, decodedItemId)
      .then((data) => {
        if (!isMounted) return
        setDetail(data)
        setMessage(data.external_found ? 'Movie details loaded from external movie knowledge sources.' : 'External movie details are unavailable for this item.')
      })
      .catch(() => {
        if (!isMounted) return
        setMessage('Could not load movie details. Check the backend server and network access.')
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [dataset, decodedItemId])

  const title = detail?.title || detail?.name || decodedItemId
  const genres = detail?.genres?.length ? detail.genres : [detail?.category || 'Unknown']

  return (
    <main className="detail-page">
      <button className="back-btn" type="button" onClick={() => navigate(-1)}>
        Back
      </button>

      <section className="detail-layout">
        <div className="detail-poster">
          <span>{String(title).slice(0, 2).toUpperCase()}</span>
        </div>

        <div className="detail-main">
          <div className="detail-kicker">
            <span>{dataset}</span>
            <span>Item {decodedItemId}</span>
            {detail?.category && <span>{detail.category}</span>}
          </div>

          <h1>{title}</h1>
          <p className="detail-status">{isLoading ? 'Loading...' : message}</p>

          <div className="genre-list">
            {genres.map((genre) => (
              <span key={genre}>{genre}</span>
            ))}
          </div>

          <section className="detail-section">
            <h2>剧情简介</h2>
            <p>{detail?.summary || 'No summary is available for this item.'}</p>
          </section>

          <section className="detail-section detail-source">
            <h2>Source</h2>
            <p>{detail?.source || 'Local dataset'}</p>
            {detail?.source_url && (
              <a href={detail.source_url} target="_blank" rel="noreferrer">
                Open source page
              </a>
            )}
          </section>

          {detail && (
            <button className="detail-add-btn" type="button" onClick={() => onAdd?.(detail)}>
              Add
            </button>
          )}
        </div>
      </section>
    </main>
  )
}

export default ProductDetail
