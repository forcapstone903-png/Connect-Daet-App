'use client'

import Link from 'next/link'

export default function AttractionCard({ attraction }) {
  return (
    <Link href={`/attractions/${attraction.id}`} className="block rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm hover:shadow-md">
      <div className="h-40 bg-gray-100">
        {attraction.featured_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={attraction.featured_image} alt={attraction.name} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-sm text-gray-500">No image</div>
        )}
      </div>
      <div className="p-3">
        <div className="font-semibold text-gray-900">{attraction.name}</div>
        <div className="text-xs text-gray-500">{attraction.category}</div>
      </div>
    </Link>
  )
}
