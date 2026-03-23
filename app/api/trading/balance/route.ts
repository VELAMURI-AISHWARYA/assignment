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

    const row = db.prepare('SELECT cash_balance FROM trading_balances WHERE user_id = ?').get(userId) as
      | { cash_balance: number }
      | undefined

    return NextResponse.json({ balance: row?.cash_balance ?? 0 })
  } catch (error: any) {
    console.error('Error fetching trading balance:', error)
    return NextResponse.json({ error: error?.message || 'Failed to fetch balance' }, { status: 500 })
  }
}
