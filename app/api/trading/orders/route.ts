import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { getAuthUserId } from '@/lib/auth'
import db from '@/lib/db'
import { matchOrder } from '@/lib/matchingEngine'

export const dynamic = 'force-dynamic'

/**
 * GET /api/trading/orders
 * Returns the authenticated user's trading orders.
 * Query params: ?symbol=NVMT&status=Pending&limit=50
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const symbol = searchParams.get('symbol')
    const status = searchParams.get('status')
    const limit = Math.min(Number(searchParams.get('limit') || 100), 200)

    let query = 'SELECT * FROM trading_orders WHERE user_id = ?'
    const params: any[] = [userId]

    if (symbol) {
      query += ' AND symbol = ?'
      params.push(symbol)
    }
    if (status) {
      query += ' AND status = ?'
      params.push(status)
    }

    query += ' ORDER BY created_at DESC LIMIT ?'
    params.push(limit)

    const orders = db.prepare(query).all(...params)
    return NextResponse.json({ orders })
  } catch (error: any) {
    console.error('Error fetching orders:', error)
    return NextResponse.json({ error: error?.message || 'Failed to fetch orders' }, { status: 500 })
  }
}

/**
 * POST /api/trading/orders
 * Place a new buy or sell order.
 * Body: { symbol, side, quantity, price, timeInForce?, goodTilDate? }
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { symbol, side, quantity, price, timeInForce = 'day', goodTilDate = null } = body

    // ── Validation ──
    if (!symbol || typeof symbol !== 'string') {
      return NextResponse.json({ error: 'Symbol is required' }, { status: 400 })
    }
    if (!['buy', 'sell'].includes(side)) {
      return NextResponse.json({ error: 'Side must be "buy" or "sell"' }, { status: 400 })
    }
    const qty = Number(quantity)
    if (!Number.isInteger(qty) || qty <= 0) {
      return NextResponse.json({ error: 'Quantity must be a positive integer' }, { status: 400 })
    }
    const orderPrice = Number(price)
    if (!orderPrice || orderPrice <= 0) {
      return NextResponse.json({ error: 'Price must be a positive number' }, { status: 400 })
    }
    if (!['day', 'gtc', 'gtd'].includes(timeInForce)) {
      return NextResponse.json({ error: 'Invalid time-in-force value' }, { status: 400 })
    }

    // ── Balance / position check ──
    if (side === 'buy') {
      const balanceRow = db.prepare('SELECT cash_balance FROM trading_balances WHERE user_id = ?').get(userId) as
        | { cash_balance: number }
        | undefined
      const balance = balanceRow?.cash_balance ?? 0
      const totalCost = qty * orderPrice
      if (totalCost > balance) {
        return NextResponse.json(
          { error: `Insufficient funds. Required: $${totalCost.toFixed(2)}, Available: $${balance.toFixed(2)}` },
          { status: 400 }
        )
      }
      // Deduct cash immediately (reserved for the order)
      db.prepare('UPDATE trading_balances SET cash_balance = cash_balance - ?, updated_at = datetime(\'now\') WHERE user_id = ?').run(
        totalCost,
        userId
      )
    } else {
      // Sell — check that user holds enough shares
      const holdingRow = db.prepare('SELECT shares FROM trading_holdings WHERE user_id = ? AND symbol = ?').get(userId, symbol) as
        | { shares: number }
        | undefined
      const held = holdingRow?.shares ?? 0
      if (qty > held) {
        return NextResponse.json(
          { error: `Insufficient shares. You hold ${held} shares of ${symbol}` },
          { status: 400 }
        )
      }
    }

    // ── Place & match order ──
    const orderId = crypto.randomUUID()
    const result = matchOrder(orderId, userId, symbol.toUpperCase(), side, qty, orderPrice, timeInForce, goodTilDate)

    // ── Settle cash for trades ──
    // For buys: cash was already deducted. Refund any un-filled portion if order isn't fully filled yet
    //   Actually, the cash deduction above covers the whole order. If partially filled, the remaining stays reserved.
    //   On cancellation we'll refund the remaining.
    // For sells: credit cash for the filled portion
    if (side === 'sell') {
      const filledQty = qty - result.remaining
      if (filledQty > 0) {
        // Get the trades for this order to compute actual proceeds
        const trades = db
          .prepare('SELECT quantity, price FROM trading_trades WHERE sell_order_id = ? ORDER BY created_at DESC')
          .all(orderId) as Array<{ quantity: number; price: number }>
        const proceeds = trades.reduce((sum, t) => sum + t.quantity * t.price, 0)
        if (proceeds > 0) {
          db.prepare('UPDATE trading_balances SET cash_balance = cash_balance + ?, updated_at = datetime(\'now\') WHERE user_id = ?').run(
            proceeds,
            userId
          )
        }
      }
    }

    // For buys that were filled: the cash was already deducted, trades happened — nothing more needed.
    // For buys that matched at a *lower* price than the limit, refund the difference
    if (side === 'buy') {
      const trades = db
        .prepare('SELECT quantity, price FROM trading_trades WHERE buy_order_id = ? ORDER BY created_at DESC')
        .all(orderId) as Array<{ quantity: number; price: number }>
      const actualCost = trades.reduce((sum, t) => sum + t.quantity * t.price, 0)
      const reservedCost = qty * orderPrice
      const refund = reservedCost - actualCost - result.remaining * orderPrice
      if (refund > 0.001) {
        db.prepare('UPDATE trading_balances SET cash_balance = cash_balance + ?, updated_at = datetime(\'now\') WHERE user_id = ?').run(
          refund,
          userId
        )
      }
    }

    return NextResponse.json({
      orderId: result.orderId,
      status: result.status,
      remaining: result.remaining,
      filled: qty - result.remaining,
    })
  } catch (error: any) {
    console.error('Error placing order:', error)
    return NextResponse.json({ error: error?.message || 'Failed to place order' }, { status: 500 })
  }
}
