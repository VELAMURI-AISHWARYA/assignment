import { NextRequest, NextResponse } from 'next/server'
import secondaryTradingAssets from '@/data/secondaryTradingAssets.json'

export const dynamic = 'force-dynamic'

/**
 * GET /api/trading/assets
 * Returns trading assets with optional filtering.
 * Query params: ?search=nova&category=tech&sort=price_asc&id=nova-materials
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.toLowerCase()
    const category = searchParams.get('category')?.toLowerCase()
    const sort = searchParams.get('sort')
    const id = searchParams.get('id')

    let assets = [...(secondaryTradingAssets as any).investments] as any[]

    // Single asset lookup
    if (id) {
      const asset = assets.find((a: any) => a.id === id)
      if (!asset) {
        return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
      }
      return NextResponse.json({ asset, templates: (secondaryTradingAssets as any).templates })
    }

    // Search filter
    if (search) {
      assets = assets.filter(
        (a: any) =>
          a.title.toLowerCase().includes(search) ||
          (a.symbol && a.symbol.toLowerCase().includes(search)) ||
          a.category.toLowerCase().includes(search) ||
          a.companyDescription?.toLowerCase().includes(search)
      )
    }

    // Category filter
    if (category && category !== 'all') {
      assets = assets.filter((a: any) => a.category.toLowerCase() === category)
    }

    // Sorting
    if (sort) {
      switch (sort) {
        case 'price_asc':
          assets.sort((a: any, b: any) => a.currentValue - b.currentValue)
          break
        case 'price_desc':
          assets.sort((a: any, b: any) => b.currentValue - a.currentValue)
          break
        case 'change_desc':
          assets.sort((a: any, b: any) => b.performancePercent - a.performancePercent)
          break
        case 'change_asc':
          assets.sort((a: any, b: any) => a.performancePercent - b.performancePercent)
          break
        case 'name_asc':
          assets.sort((a: any, b: any) => a.title.localeCompare(b.title))
          break
      }
    }

    return NextResponse.json({
      assets,
      total: assets.length,
      templates: (secondaryTradingAssets as any).templates,
    })
  } catch (error: any) {
    console.error('Error fetching trading assets:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch assets' },
      { status: 500 }
    )
  }
}
