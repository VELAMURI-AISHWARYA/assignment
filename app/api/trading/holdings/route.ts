import { NextRequest, NextResponse } from 'next/server'
import { getAuthUserId } from '@/lib/auth'
import db from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const holdings = db
      .prepare('SELECT symbol, shares, avg_cost, updated_at FROM trading_holdings WHERE user_id = ? ORDER BY symbol ASC')
      .all(userId) as Array<{ symbol: string; shares: number; avg_cost: number; updated_at: string }>

    return NextResponse.json({ holdings })
  } catch (error: any) {
    console.error('Error fetching holdings:', error)
    return NextResponse.json({ error: error?.message || 'Failed to fetch holdings' }, { status: 500 })
  }
}
