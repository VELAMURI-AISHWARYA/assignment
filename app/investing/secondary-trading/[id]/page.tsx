'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Header from '@/components/Header'
import {
  Box,
  Container,
  Typography,
  Button,
  Paper,
  Grid,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Alert,
  Snackbar,
  Skeleton,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { ArrowBack, Cancel, CheckCircle, AccessTime, Info } from '@mui/icons-material'
import { useAuth } from '@/contexts/AuthContext'
import {
  formatCurrency,
  getSecondaryTradingSymbol,
  slugify,
  getSeededColor,
  getCategoryLabel,
  buildSecondaryTradingDailyHistory,
} from '@/lib/investmentUtils'
import secondaryTradingAssets from '@/data/secondaryTradingAssets.json'
import api from '@/lib/api'

// ─── Types ──────────────────────────────────────────────

interface Order {
  id: string
  symbol: string
  side: 'buy' | 'sell'
  quantity: number
  remaining_quantity: number
  price: number
  status: string
  created_at: string
}

interface Holding {
  symbol: string
  shares: number
  avg_cost: number
}

// ─── Tiny sparkline SVG ─────────────────────────────────

function PriceChart({ data, isPositive }: { data: { date: string; close: number }[]; isPositive: boolean }) {
  const theme = useTheme()
  if (!data.length) return null
  const prices = data.map((d) => d.close)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
  const w = 700
  const h = 200
  const pad = 20
  const points = prices
    .map((p, i) => {
      const x = pad + (i / (prices.length - 1)) * (w - 2 * pad)
      const y = h - pad - ((p - min) / range) * (h - 2 * pad)
      return `${x},${y}`
    })
    .join(' ')

  const color = isPositive ? theme.palette.primary.main : '#ff4d4d'

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="200" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`${pad},${h - pad} ${points} ${w - pad},${h - pad}`}
        fill="url(#chartGradient)"
      />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Price labels */}
      <text x={pad} y={15} fill="#666" fontSize="11">{formatCurrency(max)}</text>
      <text x={pad} y={h - 5} fill="#666" fontSize="11">{formatCurrency(min)}</text>
      {/* Date labels */}
      <text x={pad} y={h - 2} fill="#555" fontSize="10">{data[0]?.date?.slice(5)}</text>
      <text x={w - pad - 40} y={h - 2} fill="#555" fontSize="10">{data[data.length - 1]?.date?.slice(5)}</text>
    </svg>
  )
}

// ─── Main Component ─────────────────────────────────────

export default function SecondaryTradingDetailPage() {
  const params = useParams()
  const router = useRouter()
  const theme = useTheme()
  const { user, isAuthenticated } = useAuth()

  const investmentSlug = Array.isArray(params.id) ? params.id[0] : params.id
  const decodedSlug = investmentSlug ? decodeURIComponent(investmentSlug) : ''
  const allAssets = (secondaryTradingAssets as any).investments as any[]
  const templates = (secondaryTradingAssets as any).templates
  const asset = allAssets.find((a: any) => a.id === decodedSlug || slugify(a.title) === decodedSlug)

  // ─── State ──────────────
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [orders, setOrders] = useState<Order[]>([])
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [balance, setBalance] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  })
  const [ordersTab, setOrdersTab] = useState(0)
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; orderId?: string }>({ open: false })
  const [dataLoading, setDataLoading] = useState(true)

  if (!asset) {
    return (
      <Box sx={{ minHeight: '100vh' }}>
        <Header />
        <Container maxWidth="lg" sx={{ pt: '120px', textAlign: 'center' }}>
          <Typography variant="h5" sx={{ color: '#ffffff' }}>Asset not found</Typography>
          <Button
            onClick={() => router.push('/investing/secondary-trading')}
            sx={{ mt: 2, color: theme.palette.primary.main }}
          >
            Back to Marketplace
          </Button>
        </Container>
      </Box>
    )
  }

  const symbol = getSecondaryTradingSymbol(asset.title, asset.symbol)

  // ─── Chart data ──────────
  const dailyHistory = useMemo(
    () => buildSecondaryTradingDailyHistory(asset.basePrice, symbol, templates.dailyHistory),
    [asset.basePrice, symbol]
  )

  // ─── Order book from template ──────────
  const orderBook = useMemo(() => {
    const asks = templates.orderBook.asks.map((a: any) => ({
      price: +(a.priceMultiplier * asset.basePrice).toFixed(4),
      size: a.size,
    }))
    const bids = templates.orderBook.bids.map((b: any) => ({
      price: +(b.priceMultiplier * asset.basePrice).toFixed(4),
      size: b.size,
    }))
    return { asks: asks.sort((a: any, b: any) => b.price - a.price), bids }
  }, [asset.basePrice])

  // ─── Fetch user data ──────────
  const fetchUserData = useCallback(async () => {
    if (!isAuthenticated) {
      setDataLoading(false)
      return
    }
    try {
      const [ordersRes, holdingsRes, balanceRes] = await Promise.all([
        api.get(`/trading/orders?symbol=${symbol}`),
        api.get('/trading/holdings'),
        api.get('/trading/balance'),
      ])
      setOrders(ordersRes.data.orders || [])
      setHoldings(holdingsRes.data.holdings || [])
      setBalance(balanceRes.data.balance ?? 0)
    } catch (err) {
      console.error('Error fetching trading data:', err)
    } finally {
      setDataLoading(false)
    }
  }, [isAuthenticated, symbol])

  useEffect(() => {
    fetchUserData()
  }, [fetchUserData])

  // Set default price to current value
  useEffect(() => {
    if (asset.currentValue && !price) {
      setPrice(asset.currentValue.toFixed(2))
    }
  }, [asset.currentValue])

  // ─── Computed ──────────
  const currentHolding = holdings.find((h) => h.symbol === symbol)
  const openOrders = orders.filter((o) => ['New', 'Pending', 'PartiallyFilled'].includes(o.status))
  const closedOrders = orders.filter((o) => ['Completed', 'Cancelled', 'Filled'].includes(o.status))
  const totalCost = (Number(quantity) || 0) * (Number(price) || 0)

  // ─── Place order ──────────
  const handlePlaceOrder = async () => {
    const qty = Number(quantity)
    const orderPrice = Number(price)
    if (!qty || qty <= 0 || !Number.isInteger(qty)) {
      setSnackbar({ open: true, message: 'Quantity must be a positive whole number', severity: 'error' })
      return
    }
    if (!orderPrice || orderPrice <= 0) {
      setSnackbar({ open: true, message: 'Price must be a positive number', severity: 'error' })
      return
    }
    if (side === 'buy' && totalCost > balance) {
      setSnackbar({ open: true, message: 'Insufficient funds for this order', severity: 'error' })
      return
    }
    if (side === 'sell' && qty > (currentHolding?.shares || 0)) {
      setSnackbar({ open: true, message: `You only hold ${currentHolding?.shares || 0} shares`, severity: 'error' })
      return
    }

    setSubmitting(true)
    try {
      const res = await api.post('/trading/orders', {
        symbol,
        side,
        quantity: qty,
        price: orderPrice,
        timeInForce: 'gtc',
      })
      const filled = res.data.filled || 0
      const msg =
        res.data.status === 'Completed'
          ? `Order filled! ${filled} shares ${side === 'buy' ? 'bought' : 'sold'} at ${formatCurrency(orderPrice)}`
          : res.data.status === 'PartiallyFilled'
          ? `Partially filled: ${filled}/${qty} shares. Remaining order is open.`
          : `Order placed. Waiting for a match.`
      setSnackbar({ open: true, message: msg, severity: 'success' })
      setQuantity('')
      fetchUserData()
    } catch (err: any) {
      setSnackbar({
        open: true,
        message: err.response?.data?.error || 'Failed to place order',
        severity: 'error',
      })
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Cancel order ──────────
  const handleCancelOrder = async (orderId: string) => {
    try {
      await api.delete(`/trading/orders/${orderId}`)
      setSnackbar({ open: true, message: 'Order cancelled', severity: 'success' })
      setConfirmDialog({ open: false })
      fetchUserData()
    } catch (err: any) {
      setSnackbar({
        open: true,
        message: err.response?.data?.error || 'Failed to cancel order',
        severity: 'error',
      })
    }
  }

  // ─── Styles ──────────
  const panelSx = {
    p: 2.5,
    bgcolor: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 2,
    mb: 2.5,
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0a0a0a' }}>
      <Header />

      <Container maxWidth="lg" sx={{ pt: { xs: '100px', sm: '120px' }, pb: 4 }}>
        <Button
          startIcon={<ArrowBack />}
          onClick={() => router.push('/investing/secondary-trading')}
          sx={{ color: '#aaa', mb: 2, textTransform: 'none', '&:hover': { color: '#fff' } }}
        >
          Back to Marketplace
        </Button>

        {/* Asset Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: '12px',
              backgroundColor: getSeededColor(symbol),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography sx={{ color: '#ffffff', fontWeight: 700, fontSize: '16px' }}>
              {symbol.slice(0, 2)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 700, color: '#ffffff' }}>
              {asset.title}
            </Typography>
            <Typography sx={{ color: '#888888' }}>
              {symbol} &bull; {getCategoryLabel(asset.category)}
            </Typography>
          </Box>
        </Box>
        <Typography variant="h3" sx={{ fontWeight: 700, color: '#ffffff', mt: 2 }}>
          {formatCurrency(asset.currentValue)}
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 3 }}>
          <Typography
            sx={{
              color: asset.isPositive ? theme.palette.primary.main : '#ff4d4d',
              fontWeight: 600,
            }}
          >
            {asset.isPositive ? '+' : ''}
            {asset.performancePercent.toFixed(2)}%
          </Typography>
          <Typography sx={{ color: '#555', fontSize: '13px' }}>Vol: {asset.volume}</Typography>
          <Typography sx={{ color: '#555', fontSize: '13px' }}>Mkt Cap: {asset.marketCap}</Typography>
        </Box>

        <Grid container spacing={3}>
          {/* ─── Left Column ─── */}
          <Grid item xs={12} md={8}>
            {/* Price Chart */}
            <Paper sx={panelSx}>
              <Typography sx={{ color: '#aaa', fontWeight: 600, fontSize: '14px', mb: 1.5 }}>
                30-Day Price Chart
              </Typography>
              <PriceChart data={dailyHistory} isPositive={asset.isPositive} />
            </Paper>

            {/* Order Book */}
            <Paper sx={panelSx}>
              <Typography sx={{ color: '#aaa', fontWeight: 600, fontSize: '14px', mb: 1.5 }}>
                Order Book
              </Typography>
              <Grid container spacing={2}>
                {/* Asks */}
                <Grid item xs={6}>
                  <Typography sx={{ color: '#ff4d4d', fontSize: '12px', fontWeight: 600, mb: 0.5 }}>ASKS (Sell)</Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ color: '#666', borderColor: 'rgba(255,255,255,0.06)', py: 0.5, fontSize: '11px' }}>Price</TableCell>
                          <TableCell align="right" sx={{ color: '#666', borderColor: 'rgba(255,255,255,0.06)', py: 0.5, fontSize: '11px' }}>Size</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {orderBook.asks.map((a: any, i: number) => (
                          <TableRow key={i} sx={{ '&:hover': { bgcolor: 'rgba(255,77,77,0.05)' } }}>
                            <TableCell
                              sx={{
                                color: '#ff4d4d',
                                borderColor: 'rgba(255,255,255,0.04)',
                                py: 0.5,
                                fontSize: '13px',
                                fontWeight: 500,
                                cursor: 'pointer',
                              }}
                              onClick={() => setPrice(a.price.toFixed(2))}
                            >
                              {formatCurrency(a.price)}
                            </TableCell>
                            <TableCell align="right" sx={{ color: '#999', borderColor: 'rgba(255,255,255,0.04)', py: 0.5, fontSize: '13px' }}>
                              {a.size.toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Grid>
                {/* Bids */}
                <Grid item xs={6}>
                  <Typography sx={{ color: theme.palette.primary.main, fontSize: '12px', fontWeight: 600, mb: 0.5 }}>BIDS (Buy)</Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ color: '#666', borderColor: 'rgba(255,255,255,0.06)', py: 0.5, fontSize: '11px' }}>Price</TableCell>
                          <TableCell align="right" sx={{ color: '#666', borderColor: 'rgba(255,255,255,0.06)', py: 0.5, fontSize: '11px' }}>Size</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {orderBook.bids.map((b: any, i: number) => (
                          <TableRow key={i} sx={{ '&:hover': { bgcolor: 'rgba(0,255,136,0.05)' } }}>
                            <TableCell
                              sx={{
                                color: theme.palette.primary.main,
                                borderColor: 'rgba(255,255,255,0.04)',
                                py: 0.5,
                                fontSize: '13px',
                                fontWeight: 500,
                                cursor: 'pointer',
                              }}
                              onClick={() => setPrice(b.price.toFixed(2))}
                            >
                              {formatCurrency(b.price)}
                            </TableCell>
                            <TableCell align="right" sx={{ color: '#999', borderColor: 'rgba(255,255,255,0.04)', py: 0.5, fontSize: '13px' }}>
                              {b.size.toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Grid>
              </Grid>
            </Paper>

            {/* Company Info */}
            <Paper sx={panelSx}>
              <Typography sx={{ color: '#aaa', fontWeight: 600, fontSize: '14px', mb: 1 }}>About {asset.title}</Typography>
              <Typography sx={{ color: '#999', fontSize: '13px', lineHeight: 1.7, mb: 2 }}>
                {asset.companyDescription}
              </Typography>
              <Grid container spacing={2}>
                {[
                  { label: 'P/E Ratio', value: asset.peRatio },
                  { label: 'Div Yield', value: asset.dividendYield ? `${asset.dividendYield}%` : 'N/A' },
                  { label: 'Revenue', value: asset.revenue },
                  { label: '52W Range', value: asset.priceRange },
                  { label: 'Avg Volume', value: asset.avgVolume },
                  { label: 'Employees', value: asset.employees },
                ].map((item) => (
                  <Grid item xs={6} sm={4} key={item.label}>
                    <Typography sx={{ color: '#666', fontSize: '11px' }}>{item.label}</Typography>
                    <Typography sx={{ color: '#ccc', fontSize: '13px', fontWeight: 600 }}>{item.value || '—'}</Typography>
                  </Grid>
                ))}
              </Grid>
            </Paper>

            {/* Orders & Positions */}
            <Paper sx={panelSx}>
              <Tabs
                value={ordersTab}
                onChange={(_, v) => setOrdersTab(v)}
                sx={{
                  mb: 2,
                  '& .MuiTab-root': { color: '#666', textTransform: 'none', fontWeight: 600, fontSize: '13px', minWidth: 'auto', px: 2 },
                  '& .Mui-selected': { color: theme.palette.primary.main },
                  '& .MuiTabs-indicator': { backgroundColor: theme.palette.primary.main },
                }}
              >
                <Tab label={`Open Orders (${openOrders.length})`} />
                <Tab label={`Order History (${closedOrders.length})`} />
                <Tab label="My Position" />
              </Tabs>

              {ordersTab === 0 && (
                <>
                  {!isAuthenticated ? (
                    <Typography sx={{ color: '#666', fontSize: '13px', py: 2, textAlign: 'center' }}>
                      Log in to see your orders
                    </Typography>
                  ) : dataLoading ? (
                    <Skeleton variant="rounded" height={60} sx={{ bgcolor: 'rgba(255,255,255,0.05)' }} />
                  ) : openOrders.length === 0 ? (
                    <Typography sx={{ color: '#666', fontSize: '13px', py: 2, textAlign: 'center' }}>No open orders</Typography>
                  ) : (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ color: '#666', borderColor: 'rgba(255,255,255,0.06)', fontSize: '11px' }}>Side</TableCell>
                            <TableCell sx={{ color: '#666', borderColor: 'rgba(255,255,255,0.06)', fontSize: '11px' }}>Qty</TableCell>
                            <TableCell sx={{ color: '#666', borderColor: 'rgba(255,255,255,0.06)', fontSize: '11px' }}>Remaining</TableCell>
                            <TableCell sx={{ color: '#666', borderColor: 'rgba(255,255,255,0.06)', fontSize: '11px' }}>Price</TableCell>
                            <TableCell sx={{ color: '#666', borderColor: 'rgba(255,255,255,0.06)', fontSize: '11px' }}>Status</TableCell>
                            <TableCell align="right" sx={{ color: '#666', borderColor: 'rgba(255,255,255,0.06)', fontSize: '11px' }}></TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {openOrders.map((o) => (
                            <TableRow key={o.id}>
                              <TableCell sx={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                                <Chip
                                  label={o.side.toUpperCase()}
                                  size="small"
                                  sx={{
                                    bgcolor: o.side === 'buy' ? 'rgba(0,255,136,0.1)' : 'rgba(255,77,77,0.1)',
                                    color: o.side === 'buy' ? theme.palette.primary.main : '#ff4d4d',
                                    fontWeight: 700,
                                    fontSize: '11px',
                                    height: 22,
                                  }}
                                />
                              </TableCell>
                              <TableCell sx={{ color: '#ccc', borderColor: 'rgba(255,255,255,0.04)', fontSize: '13px' }}>{o.quantity}</TableCell>
                              <TableCell sx={{ color: '#ccc', borderColor: 'rgba(255,255,255,0.04)', fontSize: '13px' }}>{o.remaining_quantity}</TableCell>
                              <TableCell sx={{ color: '#ccc', borderColor: 'rgba(255,255,255,0.04)', fontSize: '13px' }}>{formatCurrency(o.price)}</TableCell>
                              <TableCell sx={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                                <Chip label={o.status} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: '#aaa', fontSize: '11px', height: 22 }} />
                              </TableCell>
                              <TableCell align="right" sx={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                                <Tooltip title="Cancel order">
                                  <IconButton size="small" onClick={() => setConfirmDialog({ open: true, orderId: o.id })} sx={{ color: '#ff4d4d' }}>
                                    <Cancel fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </>
              )}

              {ordersTab === 1 && (
                <>
                  {closedOrders.length === 0 ? (
                    <Typography sx={{ color: '#666', fontSize: '13px', py: 2, textAlign: 'center' }}>No order history</Typography>
                  ) : (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell sx={{ color: '#666', borderColor: 'rgba(255,255,255,0.06)', fontSize: '11px' }}>Side</TableCell>
                            <TableCell sx={{ color: '#666', borderColor: 'rgba(255,255,255,0.06)', fontSize: '11px' }}>Qty</TableCell>
                            <TableCell sx={{ color: '#666', borderColor: 'rgba(255,255,255,0.06)', fontSize: '11px' }}>Price</TableCell>
                            <TableCell sx={{ color: '#666', borderColor: 'rgba(255,255,255,0.06)', fontSize: '11px' }}>Status</TableCell>
                            <TableCell sx={{ color: '#666', borderColor: 'rgba(255,255,255,0.06)', fontSize: '11px' }}>Date</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {closedOrders.map((o) => (
                            <TableRow key={o.id}>
                              <TableCell sx={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                                <Chip
                                  label={o.side.toUpperCase()}
                                  size="small"
                                  sx={{
                                    bgcolor: o.side === 'buy' ? 'rgba(0,255,136,0.1)' : 'rgba(255,77,77,0.1)',
                                    color: o.side === 'buy' ? theme.palette.primary.main : '#ff4d4d',
                                    fontWeight: 700,
                                    fontSize: '11px',
                                    height: 22,
                                  }}
                                />
                              </TableCell>
                              <TableCell sx={{ color: '#ccc', borderColor: 'rgba(255,255,255,0.04)', fontSize: '13px' }}>{o.quantity}</TableCell>
                              <TableCell sx={{ color: '#ccc', borderColor: 'rgba(255,255,255,0.04)', fontSize: '13px' }}>{formatCurrency(o.price)}</TableCell>
                              <TableCell sx={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                                <Chip
                                  label={o.status}
                                  size="small"
                                  icon={o.status === 'Completed' ? <CheckCircle sx={{ fontSize: 14 }} /> : undefined}
                                  sx={{
                                    bgcolor: o.status === 'Completed' ? 'rgba(0,255,136,0.1)' : 'rgba(255,255,255,0.05)',
                                    color: o.status === 'Completed' ? theme.palette.primary.main : '#888',
                                    fontSize: '11px',
                                    height: 22,
                                    '& .MuiChip-icon': { color: 'inherit' },
                                  }}
                                />
                              </TableCell>
                              <TableCell sx={{ color: '#888', borderColor: 'rgba(255,255,255,0.04)', fontSize: '12px' }}>
                                {new Date(o.created_at).toLocaleDateString()}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </>
              )}

              {ordersTab === 2 && (
                <Box sx={{ py: 1 }}>
                  {currentHolding ? (
                    <Box>
                      <Grid container spacing={2}>
                        <Grid item xs={4}>
                          <Typography sx={{ color: '#666', fontSize: '12px' }}>Shares Held</Typography>
                          <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '18px' }}>{currentHolding.shares}</Typography>
                        </Grid>
                        <Grid item xs={4}>
                          <Typography sx={{ color: '#666', fontSize: '12px' }}>Avg Cost</Typography>
                          <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '18px' }}>{formatCurrency(currentHolding.avg_cost)}</Typography>
                        </Grid>
                        <Grid item xs={4}>
                          <Typography sx={{ color: '#666', fontSize: '12px' }}>Market Value</Typography>
                          <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '18px' }}>
                            {formatCurrency(currentHolding.shares * asset.currentValue)}
                          </Typography>
                        </Grid>
                      </Grid>
                      <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)', my: 1.5 }} />
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ color: '#666', fontSize: '12px' }}>Unrealized P&L</Typography>
                        <Typography
                          sx={{
                            fontWeight: 600,
                            fontSize: '14px',
                            color:
                              asset.currentValue >= currentHolding.avg_cost
                                ? theme.palette.primary.main
                                : '#ff4d4d',
                          }}
                        >
                          {formatCurrency((asset.currentValue - currentHolding.avg_cost) * currentHolding.shares)}
                        </Typography>
                      </Box>
                    </Box>
                  ) : (
                    <Typography sx={{ color: '#666', fontSize: '13px', textAlign: 'center', py: 2 }}>
                      No position in {symbol}
                    </Typography>
                  )}
                </Box>
              )}
            </Paper>
          </Grid>

          {/* ─── Right Column — Order Form ─── */}
          <Grid item xs={12} md={4}>
            <Paper
              sx={{
                ...panelSx,
                position: { md: 'sticky' },
                top: { md: 100 },
              }}
            >
              <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '16px', mb: 2 }}>Place Order</Typography>

              {!isAuthenticated ? (
                <Box sx={{ textAlign: 'center', py: 3 }}>
                  <Typography sx={{ color: '#888', mb: 2, fontSize: '14px' }}>Log in to start trading</Typography>
                  <Button variant="contained" onClick={() => router.push('/auth')} sx={{ fontWeight: 600 }}>
                    Sign In
                  </Button>
                </Box>
              ) : (
                <>
                  {/* Buy / Sell Toggle */}
                  <ToggleButtonGroup
                    value={side}
                    exclusive
                    onChange={(_, v) => v && setSide(v)}
                    fullWidth
                    sx={{ mb: 2.5 }}
                  >
                    <ToggleButton
                      value="buy"
                      sx={{
                        color: side === 'buy' ? '#000' : '#aaa',
                        bgcolor: side === 'buy' ? theme.palette.primary.main : 'transparent',
                        borderColor: 'rgba(255,255,255,0.1)',
                        fontWeight: 700,
                        py: 1,
                        '&:hover': { bgcolor: side === 'buy' ? theme.palette.primary.main : 'rgba(255,255,255,0.05)' },
                        '&.Mui-selected': { bgcolor: theme.palette.primary.main, color: '#000' },
                        '&.Mui-selected:hover': { bgcolor: '#00e677' },
                      }}
                    >
                      BUY
                    </ToggleButton>
                    <ToggleButton
                      value="sell"
                      sx={{
                        color: side === 'sell' ? '#fff' : '#aaa',
                        bgcolor: side === 'sell' ? '#ff4d4d' : 'transparent',
                        borderColor: 'rgba(255,255,255,0.1)',
                        fontWeight: 700,
                        py: 1,
                        '&:hover': { bgcolor: side === 'sell' ? '#ff4d4d' : 'rgba(255,255,255,0.05)' },
                        '&.Mui-selected': { bgcolor: '#ff4d4d', color: '#fff' },
                        '&.Mui-selected:hover': { bgcolor: '#ff6666' },
                      }}
                    >
                      SELL
                    </ToggleButton>
                  </ToggleButtonGroup>

                  {/* Quantity */}
                  <Typography sx={{ color: '#888', fontSize: '12px', mb: 0.5 }}>Quantity (shares)</Typography>
                  <TextField
                    fullWidth
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="0"
                    size="small"
                    inputProps={{ min: 1, step: 1 }}
                    sx={{
                      mb: 2,
                      '& .MuiOutlinedInput-root': {
                        bgcolor: 'rgba(255,255,255,0.05)',
                        color: '#fff',
                        borderRadius: 1.5,
                        '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                        '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                        '&.Mui-focused fieldset': { borderColor: theme.palette.primary.main },
                      },
                    }}
                  />

                  {/* Price */}
                  <Typography sx={{ color: '#888', fontSize: '12px', mb: 0.5 }}>Limit Price ($)</Typography>
                  <TextField
                    fullWidth
                    type="number"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0.00"
                    size="small"
                    inputProps={{ min: 0.01, step: 0.01 }}
                    sx={{
                      mb: 2,
                      '& .MuiOutlinedInput-root': {
                        bgcolor: 'rgba(255,255,255,0.05)',
                        color: '#fff',
                        borderRadius: 1.5,
                        '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                        '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                        '&.Mui-focused fieldset': { borderColor: theme.palette.primary.main },
                      },
                    }}
                  />

                  {/* Order Summary */}
                  <Box
                    sx={{
                      bgcolor: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 1.5,
                      p: 1.5,
                      mb: 2.5,
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography sx={{ color: '#888', fontSize: '12px' }}>
                        {side === 'buy' ? 'Estimated Cost' : 'Estimated Proceeds'}
                      </Typography>
                      <Typography sx={{ color: '#fff', fontWeight: 600, fontSize: '14px' }}>
                        {formatCurrency(totalCost)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography sx={{ color: '#888', fontSize: '12px' }}>Cash Available</Typography>
                      <Typography sx={{ color: '#ccc', fontSize: '13px' }}>{formatCurrency(balance)}</Typography>
                    </Box>
                    {side === 'sell' && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography sx={{ color: '#888', fontSize: '12px' }}>Shares Held</Typography>
                        <Typography sx={{ color: '#ccc', fontSize: '13px' }}>{currentHolding?.shares || 0}</Typography>
                      </Box>
                    )}
                  </Box>

                  {/* Validation warnings */}
                  {side === 'buy' && totalCost > balance && Number(quantity) > 0 && (
                    <Alert severity="warning" sx={{ mb: 2, fontSize: '12px', py: 0 }}>
                      Insufficient funds
                    </Alert>
                  )}
                  {side === 'sell' && Number(quantity) > (currentHolding?.shares || 0) && Number(quantity) > 0 && (
                    <Alert severity="warning" sx={{ mb: 2, fontSize: '12px', py: 0 }}>
                      Exceeds your holdings
                    </Alert>
                  )}

                  {/* Submit */}
                  <Button
                    fullWidth
                    variant="contained"
                    onClick={handlePlaceOrder}
                    disabled={submitting || !quantity || !price}
                    sx={{
                      py: 1.5,
                      fontWeight: 700,
                      fontSize: '15px',
                      bgcolor: side === 'buy' ? theme.palette.primary.main : '#ff4d4d',
                      color: side === 'buy' ? '#000' : '#fff',
                      '&:hover': {
                        bgcolor: side === 'buy' ? '#00e677' : '#ff6666',
                      },
                      '&.Mui-disabled': {
                        bgcolor: 'rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.3)',
                      },
                    }}
                  >
                    {submitting ? (
                      <CircularProgress size={20} sx={{ color: 'inherit' }} />
                    ) : (
                      `${side === 'buy' ? 'Buy' : 'Sell'} ${symbol}`
                    )}
                  </Button>
                </>
              )}
            </Paper>
          </Grid>
        </Grid>
      </Container>

      {/* Cancel Confirmation Dialog */}
      <Dialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false })}
        PaperProps={{ sx: { bgcolor: '#1a1a1a', color: '#fff', borderRadius: 2 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Cancel Order?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#aaa' }}>
            Are you sure you want to cancel this order? Any reserved funds will be returned to your balance.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setConfirmDialog({ open: false })} sx={{ color: '#888' }}>
            Keep Order
          </Button>
          <Button
            onClick={() => confirmDialog.orderId && handleCancelOrder(confirmDialog.orderId)}
            sx={{ color: '#ff4d4d', fontWeight: 600 }}
          >
            Cancel Order
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          sx={{ fontWeight: 500 }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  )
}
