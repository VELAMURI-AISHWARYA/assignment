import { NextRequest, NextResponse } from 'next/server'
import { getAuthUserId } from '@/lib/auth'
import db from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/trading/orders/[id]
 * Cancel an open order. Refunds reserved cash for buy orders.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthUserId(request)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orderId } = await params

    const order = db.prepare('SELECT * FROM trading_orders WHERE id = ? AND user_id = ?').get(orderId, userId) as any
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (['Completed', 'Cancelled'].includes(order.status)) {
      return NextResponse.json({ error: `Order is already ${order.status.toLowerCase()}` }, { status: 400 })
    }

    // Cancel the order
    db.prepare("UPDATE trading_orders SET status = 'Cancelled', remaining_quantity = 0, updated_at = datetime('now') WHERE id = ?").run(
      orderId
    )

    // Refund reserved cash for unfilled buy orders
    if (order.side === 'buy' && order.remaining_quantity > 0) {
      const refund = order.remaining_quantity * order.price
      db.prepare("UPDATE trading_balances SET cash_balance = cash_balance + ?, updated_at = datetime('now') WHERE user_id = ?").run(
        refund,
        userId
      )
    }

    return NextResponse.json({ success: true, orderId, message: 'Order cancelled successfully' })
  } catch (error: any) {
    console.error('Error cancelling order:', error)
    return NextResponse.json({ error: error?.message || 'Failed to cancel order' }, { status: 500 })
  }
}
