'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import {
  Box,
  Container,
  Typography,
  Grid,
  Paper,
  TextField,
  InputAdornment,
  Chip,
  Skeleton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material'
import { Search, TrendingUp, TrendingDown } from '@mui/icons-material'
import { useTheme } from '@mui/material/styles'
import { useAuth } from '@/contexts/AuthContext'
import secondaryTradingAssets from '@/data/secondaryTradingAssets.json'
import { formatCurrency, getSecondaryTradingSymbol, getSeededColor, getCategoryLabel } from '@/lib/investmentUtils'

type Asset = {
  id: string
  title: string
  category: string
  basePrice: number
  previousValue: number
  currentValue: number
  performancePercent: number
  isPositive: boolean
  volume: string
  companyDescription: string
  symbol?: string
  marketCap?: string
}

const CATEGORIES = ['all', 'tech', 'healthcare', 'energy', 'consumer', 'finance']
const SORT_OPTIONS = [
  { value: 'name_asc', label: 'Name A-Z' },
  { value: 'price_desc', label: 'Price: High to Low' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'change_desc', label: 'Gainers First' },
  { value: 'change_asc', label: 'Losers First' },
]

export default function SecondaryTradingPage() {
  const router = useRouter()
  const theme = useTheme()
  const { user, isAuthenticated } = useAuth()
  const allAssets = (secondaryTradingAssets as any).investments as Asset[]

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState('name_asc')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 400)
    return () => clearTimeout(t)
  }, [])

  const filteredAssets = useMemo(() => {
    let result = [...allAssets]
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.symbol && a.symbol.toLowerCase().includes(q)) ||
          a.category.toLowerCase().includes(q)
      )
    }
    if (category !== 'all') {
      result = result.filter((a) => a.category === category)
    }
    switch (sort) {
      case 'price_asc': result.sort((a, b) => a.currentValue - b.currentValue); break
      case 'price_desc': result.sort((a, b) => b.currentValue - a.currentValue); break
      case 'change_desc': result.sort((a, b) => b.performancePercent - a.performancePercent); break
      case 'change_asc': result.sort((a, b) => a.performancePercent - b.performancePercent); break
      case 'name_asc': result.sort((a, b) => a.title.localeCompare(b.title)); break
    }
    return result
  }, [allAssets, search, category, sort])

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#0a0a0a' }}>
      <Header />

      <Container maxWidth="lg" sx={{ pt: { xs: '100px', sm: '120px' }, pb: 4 }}>
        {/* Page Header */}
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#ffffff', mb: 0.5 }}>
            Secondary Marketplace
          </Typography>
          <Typography sx={{ color: '#888888', fontSize: '15px' }}>
            Browse and trade digital securities on the secondary market
          </Typography>
        </Box>

        {/* Search & Filters */}
        <Paper
          sx={{
            p: 2.5,
            mb: 3,
            bgcolor: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 2,
          }}
        >
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
            <TextField
              placeholder="Search assets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              size="small"
              sx={{
                flex: 1,
                '& .MuiOutlinedInput-root': {
                  bgcolor: 'rgba(255,255,255,0.05)',
                  borderRadius: 1.5,
                  color: '#fff',
                  '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                  '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                  '&.Mui-focused fieldset': { borderColor: theme.palette.primary.main },
                },
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search sx={{ color: '#666' }} />
                  </InputAdornment>
                ),
              }}
            />
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <Select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                sx={{
                  bgcolor: 'rgba(255,255,255,0.05)',
                  color: '#fff',
                  borderRadius: 1.5,
                  '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                  '& .MuiSvgIcon-root': { color: '#888' },
                }}
              >
                {SORT_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {/* Category Chips */}
          <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
            {CATEGORIES.map((cat) => (
              <Chip
                key={cat}
                label={cat === 'all' ? 'All' : getCategoryLabel(cat)}
                onClick={() => setCategory(cat)}
                sx={{
                  bgcolor: category === cat ? 'rgba(0,255,136,0.15)' : 'rgba(255,255,255,0.05)',
                  color: category === cat ? theme.palette.primary.main : '#aaa',
                  border: `1px solid ${category === cat ? 'rgba(0,255,136,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                  '&:hover': {
                    bgcolor: category === cat ? 'rgba(0,255,136,0.2)' : 'rgba(255,255,255,0.08)',
                  },
                }}
              />
            ))}
          </Box>
        </Paper>

        {/* Results count */}
        <Typography sx={{ color: '#666', fontSize: '13px', mb: 2 }}>
          {filteredAssets.length} asset{filteredAssets.length !== 1 ? 's' : ''} found
        </Typography>

        {/* Asset Cards */}
        <Grid container spacing={2}>
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <Grid item xs={12} sm={6} md={4} key={i}>
                  <Skeleton
                    variant="rounded"
                    height={160}
                    sx={{ bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2 }}
                  />
                </Grid>
              ))
            : filteredAssets.map((asset) => {
                const symbol = getSecondaryTradingSymbol(asset.title, asset.symbol)
                return (
                  <Grid item xs={12} sm={6} md={4} key={asset.id}>
                    <Paper
                      onClick={() => router.push(`/investing/secondary-trading/${asset.id}`)}
                      sx={{
                        p: 2.5,
                        bgcolor: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 2,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        '&:hover': {
                          borderColor: 'rgba(0, 255, 136, 0.3)',
                          bgcolor: 'rgba(255,255,255,0.04)',
                          transform: 'translateY(-2px)',
                        },
                      }}
                    >
                      {/* Asset header */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                        <Box
                          sx={{
                            width: 40,
                            height: 40,
                            borderRadius: '10px',
                            backgroundColor: getSeededColor(symbol),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <Typography sx={{ color: '#fff', fontWeight: 700, fontSize: '14px' }}>
                            {symbol.slice(0, 2)}
                          </Typography>
                        </Box>
                        <Box sx={{ overflow: 'hidden' }}>
                          <Typography
                            sx={{
                              color: '#ffffff',
                              fontWeight: 600,
                              fontSize: '14px',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {asset.title}
                          </Typography>
                          <Typography sx={{ color: '#888', fontSize: '12px' }}>{symbol}</Typography>
                        </Box>
                      </Box>

                      {/* Price & change */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                        <Typography sx={{ color: '#ffffff', fontWeight: 700, fontSize: '20px' }}>
                          {formatCurrency(asset.currentValue)}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {asset.isPositive ? (
                            <TrendingUp sx={{ fontSize: 16, color: theme.palette.primary.main }} />
                          ) : (
                            <TrendingDown sx={{ fontSize: 16, color: '#ff4d4d' }} />
                          )}
                          <Typography
                            sx={{
                              color: asset.isPositive ? theme.palette.primary.main : '#ff4d4d',
                              fontWeight: 600,
                              fontSize: '13px',
                            }}
                          >
                            {asset.isPositive ? '+' : ''}
                            {asset.performancePercent.toFixed(2)}%
                          </Typography>
                        </Box>
                      </Box>

                      {/* Extra info */}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Chip
                          label={getCategoryLabel(asset.category)}
                          size="small"
                          sx={{
                            bgcolor: 'rgba(255,255,255,0.06)',
                            color: '#888',
                            fontSize: '11px',
                            height: 22,
                          }}
                        />
                        <Typography sx={{ color: '#666', fontSize: '11px' }}>
                          Vol: {asset.volume}
                        </Typography>
                      </Box>
                    </Paper>
                  </Grid>
                )
              })}
        </Grid>

        {!loading && filteredAssets.length === 0 && (
          <Paper
            sx={{
              p: 4,
              mt: 2,
              bgcolor: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 2,
              textAlign: 'center',
            }}
          >
            <Typography sx={{ color: '#666', fontSize: '15px' }}>
              No assets match your search. Try adjusting your filters.
            </Typography>
          </Paper>
        )}
      </Container>
    </Box>
  )
}
