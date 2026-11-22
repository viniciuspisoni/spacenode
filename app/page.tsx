import EditorialHome from './EditorialHome'

export default function Home() {
  const review = process.env.VERCEL_ENV === 'preview' && process.env.SPACENODE_LANDING_REVIEW === '1'
  return <EditorialHome review={review} />
}
