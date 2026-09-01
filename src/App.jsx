import { useState, useEffect, useRef, useMemo } from 'react'
import Papa from 'papaparse'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import './App.css'

const SPREADSHEET_ID = '1qmR0AXUvBDVo7u7PI15GLsRdho0M5W-ko0n3X8B7E7g'
const EXPENSE_SHEET = '支出管理'
const INCOME_SHEET = '収入管理'
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const SCOPE =
  'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.profile'

const TOKEN_KEY = 'gapp_token'
const EXPIRY_KEY = 'gapp_token_expiry'
const PAGE_MAX_WIDTH = 420
const MAX_DIGITS = 9

const CATEGORIES = ['食費', '日用品', '交通', '娯楽', '医療', '美容', 'その他']
const CATEGORY_COLORS = {
  食費: '#FF7A5C',
  日用品: '#4ECDC4',
  交通: '#5B8DEF',
  娯楽: '#FFC857',
  医療: '#A78BFA',
  美容: '#F472B6',
  その他: '#9CA3AF',
}
function categoryColor(name) {
  return CATEGORY_COLORS[name] || '#9CA3AF'
}

const THEMES = {
  expense: { bg: 'linear-gradient(135deg, #FFE3D8, #FFF6F2)', text: '#E8613F', accent: '#FF7A5C' },
  income: { bg: 'linear-gradient(135deg, #D3F6F0, #F1FFFC)', text: '#1F9A8B', accent: '#4ECDC4' },
  summary: { bg: 'linear-gradient(135deg, #DDE9FF, #F3F7FF)', text: '#3E6FD9', accent: '#5B8DEF' },
  paypay: { bg: 'linear-gradient(135deg, #FFD9E2, #FFF3F6)', text: '#E0264F', accent: '#FF3355' },
  settings: { bg: 'linear-gradient(135deg, #ECECF2, #F8F8FB)', text: '#555', accent: '#5B8DEF' },
}

const BIG_DATE_STYLE = { fontSize: 18, padding: '10px 12px', borderRadius: 8, border: '1px solid #ccc', width: '100%', boxSizing: 'border-box' }

function DigitPadModal({ label, initialValue, onConfirm, onClose }) {
  const [inputStr, setInputStr] = useState(initialValue ? String(initialValue) : '')

  const pressDigit = (d) => {
    if (inputStr.length >= MAX_DIGITS) return
    setInputStr((prev) => (prev === '0' ? String(d) : prev + String(d)))
  }
  const pressBackspace = () => setInputStr((prev) => prev.slice(0, -1))
  const pressClear = () => setInputStr('')
  const currentValue = Number(inputStr || '0')

  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['C', '0', '⌫'],
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#fff', zIndex: 200, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}>
        <div style={{ fontSize: 19, fontWeight: 'bold' }}>{label}</div>
        <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 24, color: '#888' }}>✕</button>
      </div>

      <div style={{ textAlign: 'center', padding: '20px 16px', fontSize: 40, fontWeight: 'bold', wordBreak: 'break-all' }}>
        {currentValue.toLocaleString()}
        <span style={{ fontSize: 20, color: '#888', marginLeft: 6 }}>円</span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 16px', gap: 12, maxWidth: PAGE_MAX_WIDTH, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {keys.map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: 12 }}>
            {row.map((k) => (
              <button
                key={k}
                onClick={() => {
                  if (k === 'C') pressClear()
                  else if (k === '⌫') pressBackspace()
                  else pressDigit(k)
                }}
                style={{
                  flex: 1,
                  padding: '18px 0',
                  fontSize: 24,
                  fontWeight: k === 'C' || k === '⌫' ? 'bold' : 'normal',
                  borderRadius: 12,
                  border: 'none',
                  background: k === 'C' || k === '⌫' ? '#F0F0F3' : '#F7F7FA',
                  color: k === 'C' ? '#FF7A5C' : '#333',
                }}
              >
                {k}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div style={{ padding: 16, maxWidth: PAGE_MAX_WIDTH, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <button onClick={() => onConfirm(currentValue)} style={{ width: '100%', padding: 16, fontSize: 18, fontWeight: 'bold', background: '#333', color: '#fff', border: 'none', borderRadius: 12 }}>
          決定
        </button>
      </div>
    </div>
  )
}

function AmountField({ label, value, onChange }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <div style={{ fontSize: 15, color: '#555', marginBottom: 4 }}>{label}</div>
      <button onClick={() => setOpen(true)} style={{ width: '100%', textAlign: 'left', padding: '12px 14px', border: '1px solid #ccc', borderRadius: 8, background: '#fff', fontSize: 18 }}>
        {Number(value).toLocaleString()}円
      </button>
      {open && (
        <DigitPadModal label={label} initialValue={value} onClose={() => setOpen(false)} onConfirm={(v) => { onChange(v); setOpen(false) }} />
      )}
    </div>
  )
}

function CategoryButtons({ value, onChange, allowEmpty }) {
  return (
    <div>
      <div style={{ fontSize: 15, color: '#555', marginBottom: 4 }}>カテゴリ</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {allowEmpty && (
          <button onClick={() => onChange('')} style={{ padding: '7px 14px', borderRadius: 16, border: value === '' ? '2px solid #333' : '1px solid #ccc', background: '#fff', color: '#333', fontSize: 14 }}>
            AIにおまかせ
          </button>
        )}
        {CATEGORIES.map((c) => {
          const color = categoryColor(c)
          const active = value === c
          return (
            <button
              key={c}
              onClick={() => onChange(c)}
              style={{ padding: '7px 14px', borderRadius: 16, border: active ? `2px solid ${color}` : '1px solid #ddd', background: active ? color : '#fff', color: active ? '#fff' : '#333', fontSize: 14, fontWeight: active ? 'bold' : 'normal' }}
            >
              {c}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function callGemini(parts, json = false) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }], ...(json ? { generationConfig: { responseMimeType: 'application/json' } } : {}) }),
    }
  )
  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error(data.error?.message || 'AIからの応答がありませんでした')
  return text
}

async function askGeminiJson(file, prompt) {
  const base64 = await fileToBase64(file)
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: file.type, data: base64 } }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    }
  )
  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error(data.error?.message || '読み取りに失敗しました')
  return JSON.parse(text)
}

function analyzeReceipt(file) {
  const prompt = `これはレシートの画像です。以下の項目をJSON形式だけで答えてください。前置きや説明は不要です。
{
  "date": "YYYY-MM-DD形式の日付(レシートに記載の年月日。年が無ければ${new Date().getFullYear()}年として補完)",
  "store": "店舗名",
  "amount": "合計金額(数字のみ、カンマや円マークなし)",
  "category": "食費・日用品・交通・娯楽・医療・美容・その他 のいずれか、内容から最も近いもの"
}
読み取れない項目は空文字にしてください。`
  return askGeminiJson(file, prompt)
}

async function generateSummaryComment(monthlySummary, selectedMonth, categoryBreakdown) {
  const prompt = `あなたは家計簿アプリのアシスタントです。以下のデータを見て、日本語で2〜3文の短い分析コメントを書いてください。JSON化せず、プレーンな文章だけを返してください。前月との比較、支出が多いカテゴリへの気づき、簡単なアドバイスを含めてください。

月別データ(income=収入, expense=支出, 単位は円): ${JSON.stringify(monthlySummary)}
注目している月: ${selectedMonth}
この月のカテゴリ別支出: ${JSON.stringify(categoryBreakdown)}`
  return callGemini([{ text: prompt }])
}

async function guessCategoriesForStores(storeNames) {
  if (storeNames.length === 0) return []
  const prompt = `以下は店舗名・取引先名のリストです。それぞれについて、最も近いカテゴリを「食費・日用品・交通・娯楽・医療・美容・その他」から1つ選び、JSON配列で答えてください。配列の順番と個数は入力と同じにしてください。前置きは不要です。
入力: ${JSON.stringify(storeNames)}
出力形式の例: ["食費", "日用品", "その他"]`
  const text = await callGemini([{ text: prompt }], true)
  return JSON.parse(text)
}

function toYearMonth(raw) {
  if (!raw) return null
  const s = String(raw).trim()
  const m = s.match(/(\d{4})[\/\-年](\d{1,2})/)
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2, '0')}`
}

function toSortableDate(raw) {
  if (!raw) return 0
  const s = String(raw).trim()
  const m = s.match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/)
  if (m) {
    const [, y, mo, d] = m
    return Number(`${y}${mo.padStart(2, '0')}${d.padStart(2, '0')}`)
  }
  const ym = s.match(/(\d{4})[\/\-](\d{1,2})/)
  if (ym) {
    const [, y, mo] = ym
    return Number(`${y}${mo.padStart(2, '0')}00`)
  }
  return 0
}

function toNumber(raw) {
  if (raw === undefined || raw === null || raw === '') return 0
  const n = Number(String(raw).replace(/[,¥円]/g, ''))
  return isNaN(n) ? 0 : n
}

function paypayDateToIso(raw) {
  const m = String(raw).match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/)
  if (!m) return ''
  const [, y, mo, d] = m
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function App() {
  const [accessToken, setAccessToken] = useState(null)
  const [profile, setProfile] = useState(null)
  const [view, setView] = useState('expense')
  const [expenseSubView, setExpenseSubView] = useState('auto')
  const [incomeSubView, setIncomeSubView] = useState('input')
  const [summarySubView, setSummarySubView] = useState('chart')
  const [status, setStatus] = useState('')
  const tokenClientRef = useRef(null)
  const sheetIdCacheRef = useRef({})
  const lastCommentedMonthRef = useRef(null)
  const accessTokenRef = useRef(null) // 非同期処理の中で常に最新のトークンを参照するため

  const [date, setDate] = useState('')
  const [store, setStore] = useState('')
  const [amount, setAmount] = useState(0)
  const [category, setCategory] = useState('')
  const [memo, setMemo] = useState('')
  const [receiptCategory, setReceiptCategory] = useState('')

  // レシートの読み取り待ち行列(連続で撮影できるようにするための一覧)
  const [receiptQueue, setReceiptQueue] = useState([]) // { id, status: 'processing'|'done'|'error', date, store, amount, category, error }

  const [yearMonth, setYearMonth] = useState('')
  const [totalPay, setTotalPay] = useState(0)
  const [totalDeduction, setTotalDeduction] = useState(0)
  const [allowance, setAllowance] = useState(0)
  const [incomeMemo, setIncomeMemo] = useState('')

  const [summaryLoading, setSummaryLoading] = useState(false)
  const [expenseRows, setExpenseRows] = useState([])
  const [incomeRows, setIncomeRows] = useState([])
  const [selectedMonth, setSelectedMonth] = useState('')

  const [aiComment, setAiComment] = useState('')
  const [aiCommentLoading, setAiCommentLoading] = useState(false)

  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyList, setHistoryList] = useState([])
  const [incomeHistoryLoading, setIncomeHistoryLoading] = useState(false)
  const [incomeHistoryList, setIncomeHistoryList] = useState([])

  const [editingExpenseRow, setEditingExpenseRow] = useState(null)
  const [expenseEditDraft, setExpenseEditDraft] = useState(null)
  const [editingIncomeRow, setEditingIncomeRow] = useState(null)
  const [incomeEditDraft, setIncomeEditDraft] = useState(null)

  const [paypayLoading, setPaypayLoading] = useState(false)
  const [paypayPreview, setPaypayPreview] = useState([])
  const [paypaySkippedCount, setPaypaySkippedCount] = useState(0)
  const [paypaySaving, setPaypaySaving] = useState(false)

  const basicPay = totalPay - totalDeduction
  const netPay = basicPay + allowance

  const theme = THEMES[view] || THEMES.settings

  const saveToken = (token, expiresInSeconds) => {
    const expiryTime = Date.now() + expiresInSeconds * 1000
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(EXPIRY_KEY, String(expiryTime))
    accessTokenRef.current = token
    setAccessToken(token)
  }

  const clearToken = () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EXPIRY_KEY)
    accessTokenRef.current = null
    setAccessToken(null)
    setProfile(null)
  }

  const fetchProfile = async (token) => {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        setProfile({ name: data.name, picture: data.picture })
      }
    } catch {
      // 無視
    }
  }

  useEffect(() => {
    const initClient = () => {
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: (response) => {
          if (response.access_token) {
            saveToken(response.access_token, response.expires_in)
            fetchProfile(response.access_token)
            setStatus('ログイン成功!')
          }
        },
      })

      const savedToken = localStorage.getItem(TOKEN_KEY)
      const savedExpiry = Number(localStorage.getItem(EXPIRY_KEY))

      if (savedToken && savedExpiry > Date.now()) {
        accessTokenRef.current = savedToken
        setAccessToken(savedToken)
        fetchProfile(savedToken)
      } else if (savedToken) {
        tokenClientRef.current.requestAccessToken({ prompt: '' })
      }
    }

    if (window.google) {
      initClient()
    } else {
      const interval = setInterval(() => {
        if (window.google) {
          clearInterval(interval)
          initClient()
        }
      }, 200)
    }
  }, [])

  const login = () => tokenClientRef.current.requestAccessToken({ prompt: 'consent' })
  const logout = () => {
    clearToken()
    setStatus('ログアウトしました')
  }

  const appendRow = async (sheetName, row) => {
    const token = accessTokenRef.current
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}!A:Z:append?valueInputOption=USER_ENTERED`
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [row] }),
    })
    if (res.ok) return true
    if (res.status === 401) {
      setStatus('セッションを更新しています...')
      tokenClientRef.current.requestAccessToken({ prompt: '' })
      return false
    }
    const err = await res.json()
    throw new Error(err.error.message)
  }

  const fetchSheetValues = async (sheetName) => {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessTokenRef.current}` } })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error.message)
    }
    const data = await res.json()
    return data.values || []
  }

  const getSheetId = async (sheetName) => {
    if (sheetIdCacheRef.current[sheetName] !== undefined) return sheetIdCacheRef.current[sheetName]
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessTokenRef.current}` } })
    const data = await res.json()
    const found = data.sheets.find((s) => s.properties.title === sheetName)
    const id = found ? found.properties.sheetId : null
    sheetIdCacheRef.current[sheetName] = id
    return id
  }

  const updateRow = async (sheetName, rowNumber, values) => {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}!C${rowNumber}:G${rowNumber}?valueInputOption=USER_ENTERED`
    const res = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessTokenRef.current}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [values] }),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error.message)
    }
  }

  const deleteRow = async (sheetName, rowNumber) => {
    const sheetId = await getSheetId(sheetName)
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}:batchUpdate`
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessTokenRef.current}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowNumber - 1, endIndex: rowNumber } } }] }),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error.message)
    }
  }

  const loadSummaryData = async () => {
    if (!accessToken) return
    setSummaryLoading(true)
    setStatus('')
    try {
      const [expenseValues, incomeValues] = await Promise.all([fetchSheetValues(EXPENSE_SHEET), fetchSheetValues(INCOME_SHEET)])
      const parsedExpense = expenseValues.slice(1).map((r) => ({ month: toYearMonth(r[2]), category: r[5] || '未分類', amount: toNumber(r[4]) })).filter((r) => r.month)
      const parsedIncome = incomeValues.slice(1).map((r) => ({ month: toYearMonth(r[2]), amount: toNumber(r[5]) })).filter((r) => r.month)
      setExpenseRows(parsedExpense)
      setIncomeRows(parsedIncome)
      const months = Array.from(new Set([...parsedExpense, ...parsedIncome].map((r) => r.month))).sort()
      if (months.length > 0) setSelectedMonth(months[months.length - 1])
    } catch (err) {
      setStatus('集計データの取得に失敗しました: ' + err.message)
    } finally {
      setSummaryLoading(false)
    }
  }

  const loadHistory = async () => {
    if (!accessToken) return
    setHistoryLoading(true)
    setStatus('')
    try {
      const values = await fetchSheetValues(EXPENSE_SHEET)
      const rows = values.slice(1).map((r, i) => ({ rowNumber: i + 2, date: r[2] || '', store: r[3] || '', amount: toNumber(r[4]), category: r[5] || '', memo: r[6] || '' }))
      rows.sort((a, b) => toSortableDate(b.date) - toSortableDate(a.date))
      setHistoryList(rows)
    } catch (err) {
      setStatus('履歴の取得に失敗しました: ' + err.message)
    } finally {
      setHistoryLoading(false)
    }
  }

  const loadIncomeHistory = async () => {
    if (!accessToken) return
    setIncomeHistoryLoading(true)
    setStatus('')
    try {
      const values = await fetchSheetValues(INCOME_SHEET)
      const rows = values.slice(1).map((r, i) => ({ rowNumber: i + 2, yearMonth: r[2] || '', basicPay: toNumber(r[3]), allowance: toNumber(r[4]), netPay: toNumber(r[5]), memo: r[6] || '' }))
      rows.sort((a, b) => toSortableDate(b.yearMonth) - toSortableDate(a.yearMonth))
      setIncomeHistoryList(rows)
    } catch (err) {
      setStatus('収入履歴の取得に失敗しました: ' + err.message)
    } finally {
      setIncomeHistoryLoading(false)
    }
  }

  useEffect(() => {
    if (!accessToken) return
    if (view === 'summary' && summarySubView === 'chart') loadSummaryData()
    if (view === 'summary' && summarySubView === 'expenseList') loadHistory()
    if (view === 'summary' && summarySubView === 'incomeList') loadIncomeHistory()
    if (view === 'expense' && expenseSubView === 'history') loadHistory()
    if (view === 'income' && incomeSubView === 'history') loadIncomeHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, expenseSubView, incomeSubView, summarySubView, accessToken])

  const monthlySummary = useMemo(() => {
    const map = {}
    for (const r of expenseRows) {
      map[r.month] = map[r.month] || { month: r.month, expense: 0, income: 0 }
      map[r.month].expense += r.amount
    }
    for (const r of incomeRows) {
      map[r.month] = map[r.month] || { month: r.month, expense: 0, income: 0 }
      map[r.month].income += r.amount
    }
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month)).map((m) => ({ ...m, balance: m.income - m.expense }))
  }, [expenseRows, incomeRows])

  const availableMonths = monthlySummary.map((m) => m.month)
  const categoryBreakdown = useMemo(() => {
    const map = {}
    for (const r of expenseRows) {
      if (r.month !== selectedMonth) continue
      map[r.category] = (map[r.category] || 0) + r.amount
    }
    return Object.entries(map).map(([name, value]) => ({ name, value }))
  }, [expenseRows, selectedMonth])
  const selectedSummary = monthlySummary.find((m) => m.month === selectedMonth)

  const handleGenerateComment = async (month, summaryData, breakdown) => {
    setAiCommentLoading(true)
    try {
      const text = await generateSummaryComment(summaryData, month, breakdown)
      setAiComment(text.trim())
    } catch (err) {
      setAiComment('')
      setStatus('AIコメントの生成に失敗しました: ' + err.message)
    } finally {
      setAiCommentLoading(false)
    }
  }

  useEffect(() => {
    if (view !== 'summary' || summarySubView !== 'chart') return
    if (!selectedMonth || monthlySummary.length === 0) return
    if (lastCommentedMonthRef.current === selectedMonth) return
    lastCommentedMonthRef.current = selectedMonth
    handleGenerateComment(selectedMonth, monthlySummary, categoryBreakdown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, summarySubView, selectedMonth, monthlySummary])

  // レシート画像が選ばれた瞬間に、待ち行列に追加してすぐに次の撮影ができるようにする
  const handleReceiptImage = (e) => {
    const file = e.target.files[0]
    e.target.value = '' // すぐにリセットして、続けて撮影できるようにする

    if (!file) return
    if (!accessTokenRef.current) {
      setStatus('先にログインしてください')
      return
    }

    const jobId = Math.random().toString(16).slice(2, 10)
    const chosenCategory = receiptCategory // その時点で選ばれていたカテゴリを使う

    setReceiptQueue((prev) => [{ id: jobId, status: 'processing' }, ...prev])

    // ここから先は裏側で処理し、画面はブロックしない
    ;(async () => {
      try {
        const result = await analyzeReceipt(file)
        const finalCategory = chosenCategory || result.category || 'その他'
        const row = [jobId, '', result.date || '', result.store || '', result.amount || '', finalCategory, '']
        const ok = await appendRow(EXPENSE_SHEET, row)
        if (ok) {
          setReceiptQueue((prev) =>
            prev.map((j) =>
              j.id === jobId
                ? { ...j, status: 'done', date: result.date, store: result.store, amount: result.amount, category: finalCategory }
                : j
            )
          )
        } else {
          setReceiptQueue((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: 'error', error: 'セッション更新後、再度お試しください' } : j)))
        }
      } catch (err) {
        setReceiptQueue((prev) => prev.map((j) => (j.id === jobId ? { ...j, status: 'error', error: err.message } : j)))
      }
    })()
  }

  const addExpense = async () => {
    if (!accessToken) {
      setStatus('先にログインしてください')
      return
    }
    if (!category) {
      setStatus('カテゴリを選択してください')
      return
    }
    setStatus('保存中...')
    const id = Math.random().toString(16).slice(2, 10)
    const row = [id, '', date, store, amount, category, memo]
    try {
      const ok = await appendRow(EXPENSE_SHEET, row)
      if (ok) {
        setStatus('保存しました!')
        setDate('')
        setStore('')
        setAmount(0)
        setCategory('')
        setMemo('')
      }
    } catch (err) {
      setStatus('エラー: ' + err.message)
    }
  }

  const addIncome = async () => {
    if (!accessToken) {
      setStatus('先にログインしてください')
      return
    }
    if (!yearMonth) {
      setStatus('年月を入力してください')
      return
    }
    setStatus('保存中...')
    const id = Math.random().toString(16).slice(2, 10)
    const row = [id, '', yearMonth, basicPay, allowance, netPay, incomeMemo]
    try {
      const ok = await appendRow(INCOME_SHEET, row)
      if (ok) {
        setStatus('保存しました!')
        setYearMonth('')
        setTotalPay(0)
        setTotalDeduction(0)
        setAllowance(0)
        setIncomeMemo('')
      }
    } catch (err) {
      setStatus('エラー: ' + err.message)
    }
  }

  const startEditExpense = (row) => {
    setEditingExpenseRow(row.rowNumber)
    setExpenseEditDraft({ date: row.date, store: row.store, amount: row.amount, category: row.category, memo: row.memo })
  }
  const cancelEditExpense = () => {
    setEditingExpenseRow(null)
    setExpenseEditDraft(null)
  }
  const saveEditExpense = async (rowNumber) => {
    setStatus('更新中...')
    try {
      await updateRow(EXPENSE_SHEET, rowNumber, [expenseEditDraft.date, expenseEditDraft.store, expenseEditDraft.amount, expenseEditDraft.category, expenseEditDraft.memo])
      setStatus('更新しました!')
      cancelEditExpense()
      loadHistory()
    } catch (err) {
      setStatus('更新エラー: ' + err.message)
    }
  }
  const removeExpenseRow = async (rowNumber) => {
    if (!window.confirm('この支出データを削除します。よろしいですか?')) return
    setStatus('削除中...')
    try {
      await deleteRow(EXPENSE_SHEET, rowNumber)
      setStatus('削除しました')
      loadHistory()
    } catch (err) {
      setStatus('削除エラー: ' + err.message)
    }
  }

  const startEditIncome = (row) => {
    setEditingIncomeRow(row.rowNumber)
    setIncomeEditDraft({ yearMonth: row.yearMonth, basicPay: row.basicPay, allowance: row.allowance, memo: row.memo })
  }
  const cancelEditIncome = () => {
    setEditingIncomeRow(null)
    setIncomeEditDraft(null)
  }
  const saveEditIncome = async (rowNumber) => {
    setStatus('更新中...')
    const recomputedNet = Number(incomeEditDraft.basicPay) + Number(incomeEditDraft.allowance)
    try {
      await updateRow(INCOME_SHEET, rowNumber, [incomeEditDraft.yearMonth, incomeEditDraft.basicPay, incomeEditDraft.allowance, recomputedNet, incomeEditDraft.memo])
      setStatus('更新しました!')
      cancelEditIncome()
      loadIncomeHistory()
    } catch (err) {
      setStatus('更新エラー: ' + err.message)
    }
  }
  const removeIncomeRow = async (rowNumber) => {
    if (!window.confirm('この収入データを削除します。よろしいですか?')) return
    setStatus('削除中...')
    try {
      await deleteRow(INCOME_SHEET, rowNumber)
      setStatus('削除しました')
      loadIncomeHistory()
    } catch (err) {
      setStatus('削除エラー: ' + err.message)
    }
  }

  const handlePaypayCsv = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!accessToken) {
      setStatus('先にログインしてください')
      return
    }

    setPaypayLoading(true)
    setStatus('')
    setPaypayPreview([])
    setPaypaySkippedCount(0)

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const payments = results.data
            .filter((r) => (r['取引内容'] || '').trim() === '支払い')
            .map((r) => ({ date: paypayDateToIso(r['取引日']), store: (r['取引先'] || '').trim(), amount: toNumber(r['出金金額（円）']) }))
            .filter((r) => r.date && r.amount > 0)

          const existingValues = await fetchSheetValues(EXPENSE_SHEET)
          const existingKeys = new Set(existingValues.slice(1).map((r) => `${r[2]}|${toNumber(r[4])}`))

          const uniquePayments = []
          let skipped = 0
          for (const p of payments) {
            const key = `${p.date}|${p.amount}`
            if (existingKeys.has(key)) skipped += 1
            else uniquePayments.push(p)
          }

          setPaypaySkippedCount(skipped)

          if (uniquePayments.length === 0) {
            setPaypayPreview([])
            setStatus('新しく取り込める取引はありませんでした(すべて登録済みか、対象がありません)')
            return
          }

          setStatus('AIがカテゴリを推測しています...')
          const categories = await guessCategoriesForStores(uniquePayments.map((p) => p.store))

          const preview = uniquePayments.map((p, i) => ({ ...p, category: categories[i] || 'その他', include: true }))
          setPaypayPreview(preview)
          setStatus(`${preview.length}件の新しい取引が見つかりました(${skipped}件は登録済みのため除外)`)
        } catch (err) {
          setStatus('CSVの処理に失敗しました: ' + err.message)
        } finally {
          setPaypayLoading(false)
          e.target.value = ''
        }
      },
      error: (err) => {
        setStatus('CSVの読み込みに失敗しました: ' + err.message)
        setPaypayLoading(false)
      },
    })
  }

  const updatePaypayPreviewRow = (index, patch) => {
    setPaypayPreview((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const savePaypayPreview = async () => {
    const toSave = paypayPreview.filter((r) => r.include)
    if (toSave.length === 0) {
      setStatus('記録する項目がありません')
      return
    }
    setPaypaySaving(true)
    setStatus('まとめて保存しています...')
    try {
      for (const r of toSave) {
        const id = Math.random().toString(16).slice(2, 10)
        await appendRow(EXPENSE_SHEET, [id, '', r.date, r.store, r.amount, r.category, 'PayPay連携'])
      }
      setStatus(`${toSave.length}件を記録しました!`)
      setPaypayPreview([])
    } catch (err) {
      setStatus('保存中にエラーが発生しました: ' + err.message)
    } finally {
      setPaypaySaving(false)
    }
  }

  const renderExpenseList = () => (
    <div style={{ textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 'bold' }}>支出一覧</div>
        <button onClick={loadHistory} style={{ background: THEMES.expense.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 14 }}>
          {historyLoading ? '読み込み中...' : '🔄 更新'}
        </button>
      </div>

      {historyList.length === 0 && !historyLoading && <p style={{ color: '#888' }}>データがありません。</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {historyList.map((row) => {
          const isEditing = editingExpenseRow === row.rowNumber
          return (
            <div key={row.rowNumber} style={{ background: '#fff', borderRadius: 10, padding: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderLeft: `5px solid ${categoryColor(row.category)}`, textAlign: 'left' }}>
              {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input type="date" value={expenseEditDraft.date} onChange={(e) => setExpenseEditDraft({ ...expenseEditDraft, date: e.target.value })} style={BIG_DATE_STYLE} />
                  <input placeholder="店舗名" value={expenseEditDraft.store} onChange={(e) => setExpenseEditDraft({ ...expenseEditDraft, store: e.target.value })} />
                  <input type="number" placeholder="金額" value={expenseEditDraft.amount} onChange={(e) => setExpenseEditDraft({ ...expenseEditDraft, amount: e.target.value })} />
                  <CategoryButtons value={expenseEditDraft.category} onChange={(c) => setExpenseEditDraft({ ...expenseEditDraft, category: c })} />
                  <input placeholder="備考" value={expenseEditDraft.memo} onChange={(e) => setExpenseEditDraft({ ...expenseEditDraft, memo: e.target.value })} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={cancelEditExpense} style={{ flex: 1 }}>キャンセル</button>
                    <button onClick={() => saveEditExpense(row.rowNumber)} style={{ flex: 1, background: '#4ECDC4', color: '#fff', border: 'none', borderRadius: 6 }}>保存</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 13, color: categoryColor(row.category), fontWeight: 'bold' }}>{row.date} ・ {row.category || '未分類'}</div>
                    <div style={{ fontSize: 15 }}>{row.store || '(店舗名なし)'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 4, fontSize: 16 }}>{row.amount.toLocaleString()}円</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => startEditExpense(row)} style={{ fontSize: 13, padding: '4px 8px' }}>編集</button>
                      <button onClick={() => removeExpenseRow(row.rowNumber)} style={{ fontSize: 13, padding: '4px 8px', color: '#FF7A5C', border: '1px solid #FF7A5C', borderRadius: 4, background: '#fff' }}>削除</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  const renderIncomeList = () => (
    <div style={{ textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 'bold' }}>収入一覧</div>
        <button onClick={loadIncomeHistory} style={{ background: THEMES.income.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 14 }}>
          {incomeHistoryLoading ? '読み込み中...' : '🔄 更新'}
        </button>
      </div>

      {incomeHistoryList.length === 0 && !incomeHistoryLoading && <p style={{ color: '#888' }}>データがありません。</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {incomeHistoryList.map((row) => {
          const isEditing = editingIncomeRow === row.rowNumber
          return (
            <div key={row.rowNumber} style={{ background: '#fff', borderRadius: 10, padding: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.08)', borderLeft: `5px solid ${THEMES.income.accent}`, textAlign: 'left' }}>
              {isEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input type="month" value={incomeEditDraft.yearMonth} onChange={(e) => setIncomeEditDraft({ ...incomeEditDraft, yearMonth: e.target.value })} style={BIG_DATE_STYLE} />
                  <input type="number" placeholder="基本支給額" value={incomeEditDraft.basicPay} onChange={(e) => setIncomeEditDraft({ ...incomeEditDraft, basicPay: e.target.value })} />
                  <input type="number" placeholder="手当支給額" value={incomeEditDraft.allowance} onChange={(e) => setIncomeEditDraft({ ...incomeEditDraft, allowance: e.target.value })} />
                  <input placeholder="備考" value={incomeEditDraft.memo} onChange={(e) => setIncomeEditDraft({ ...incomeEditDraft, memo: e.target.value })} />
                  <div style={{ fontSize: 13, color: '#888' }}>手取り額(自動計算): {(Number(incomeEditDraft.basicPay) + Number(incomeEditDraft.allowance)).toLocaleString()}円</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={cancelEditIncome} style={{ flex: 1 }}>キャンセル</button>
                    <button onClick={() => saveEditIncome(row.rowNumber)} style={{ flex: 1, background: '#4ECDC4', color: '#fff', border: 'none', borderRadius: 6 }}>保存</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 13, color: THEMES.income.accent, fontWeight: 'bold' }}>{row.yearMonth}</div>
                    <div style={{ fontSize: 14 }}>基本 {row.basicPay.toLocaleString()}円 ・ 手当 {row.allowance.toLocaleString()}円</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 4, fontSize: 16 }}>{row.netPay.toLocaleString()}円</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => startEditIncome(row)} style={{ fontSize: 13, padding: '4px 8px' }}>編集</button>
                      <button onClick={() => removeIncomeRow(row.rowNumber)} style={{ fontSize: 13, padding: '4px 8px', color: '#FF7A5C', border: '1px solid #FF7A5C', borderRadius: 4, background: '#fff' }}>削除</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )

  const subTabButton = (active, label, onClick) => (
    <button
      onClick={onClick}
      style={{ border: 'none', borderRadius: 20, padding: '8px 16px', fontSize: 15, fontWeight: active ? 'bold' : 'normal', background: active ? theme.accent : '#fff', color: active ? '#fff' : theme.text, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ maxWidth: PAGE_MAX_WIDTH, margin: '0 auto', fontFamily: 'sans-serif', minHeight: '100vh', background: '#FAFAFC', textAlign: 'left', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ background: theme.bg, padding: '26px 16px 18px', borderRadius: '0 0 20px 20px', transition: 'background 0.3s' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: 32, margin: 0, color: theme.text, letterSpacing: 0.5, fontWeight: 800 }}>Budget App</h1>

          {profile?.picture ? (
            <img
              src={profile.picture}
              alt={profile.name || 'ユーザー'}
              title={profile.name}
              onClick={() => setView('settings')}
              style={{ width: 42, height: 42, borderRadius: '50%', cursor: 'pointer', border: `2px solid ${theme.accent}` }}
            />
          ) : (
            <button onClick={() => setView('settings')} style={{ border: 'none', borderRadius: 16, padding: '8px 14px', background: theme.accent, color: '#fff', fontSize: 16 }}>設定</button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
          {[
            { key: 'expense', label: '支出' },
            { key: 'income', label: '収入' },
            { key: 'summary', label: '集計' },
            { key: 'paypay', label: 'PayPay' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              style={{ border: 'none', borderRadius: 20, padding: '10px 18px', fontSize: 18, fontWeight: 'bold', background: view === t.key ? THEMES[t.key].accent : 'rgba(255,255,255,0.6)', color: view === t.key ? '#fff' : THEMES[t.key].text }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: 16, boxSizing: 'border-box' }}>
        {view === 'settings' && (
          <div>
            {profile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <img src={profile.picture} alt={profile.name} style={{ width: 48, height: 48, borderRadius: '50%' }} />
                <div>{profile.name}</div>
              </div>
            )}
            <p>ログイン状態: {accessToken ? 'ログイン済み' : '未ログイン'}</p>
            {accessToken ? (
              <button onClick={logout} style={{ background: '#FF7A5C', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px' }}>ログアウト</button>
            ) : (
              <button onClick={login} style={{ background: '#5B8DEF', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px' }}>Googleでログイン</button>
            )}
            <div style={{ marginTop: 20 }}>
              <button onClick={() => setView('expense')}>戻る</button>
            </div>
          </div>
        )}

        {view === 'expense' && (
          <div>
            {!accessToken && (
              <button onClick={login} style={{ marginBottom: 20, background: '#5B8DEF', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px' }}>Googleでログイン</button>
            )}

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {subTabButton(expenseSubView === 'auto', '📷 自動入力', () => setExpenseSubView('auto'))}
              {subTabButton(expenseSubView === 'manual', '✏️ 手入力', () => setExpenseSubView('manual'))}
              {subTabButton(expenseSubView === 'history', '📋 履歴', () => setExpenseSubView('history'))}
            </div>

            {expenseSubView === 'auto' && (
              <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8, color: theme.text }}>📷 レシートで自動記録</div>
                <CategoryButtons value={receiptCategory} onChange={setReceiptCategory} allowEmpty />
                <label style={{ display: 'block', textAlign: 'center', marginTop: 12, padding: '14px 16px', background: theme.accent, color: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 17 }}>
                  📷 レシートを撮影する
                  <input type="file" accept="image/*" capture="environment" onChange={handleReceiptImage} style={{ display: 'none' }} />
                </label>
                <p style={{ fontSize: 13, color: '#888', marginTop: 8, marginBottom: 0 }}>
                  撮影すると内容を確認せずそのまま記録されます。処理中でも、続けて次のレシートを撮影できます。
                </p>

                {receiptQueue.length > 0 && (
                  <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {receiptQueue.map((job) => (
                      <div
                        key={job.id}
                        style={{
                          border: '1px solid #eee',
                          borderRadius: 8,
                          padding: 10,
                          background: job.status === 'error' ? '#FFF3F0' : '#FAFAFA',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        {job.status === 'processing' && <div style={{ fontSize: 14, color: '#888' }}>⏳ 読み取り中...</div>}
                        {job.status === 'done' && (
                          <>
                            <div>
                              <div style={{ fontSize: 12, color: categoryColor(job.category), fontWeight: 'bold' }}>{job.date} ・ {job.category}</div>
                              <div style={{ fontSize: 14 }}>{job.store || '(店舗名なし)'}</div>
                            </div>
                            <div style={{ fontWeight: 'bold' }}>{Number(job.amount || 0).toLocaleString()}円</div>
                          </>
                        )}
                        {job.status === 'error' && <div style={{ fontSize: 13, color: '#E8613F' }}>⚠️ 失敗: {job.error}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {expenseSubView === 'manual' && (
              <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8, color: theme.text }}>✏️ 手入力で記録</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={BIG_DATE_STYLE} />
                  <input placeholder="店舗名" value={store} onChange={(e) => setStore(e.target.value)} />
                  <AmountField label="金額" value={amount} onChange={setAmount} />
                  <CategoryButtons value={category} onChange={setCategory} />
                  <input placeholder="備考" value={memo} onChange={(e) => setMemo(e.target.value)} />
                  <button onClick={addExpense} style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, padding: 12, fontWeight: 'bold', fontSize: 17 }}>記録する</button>
                </div>
              </div>
            )}

            {expenseSubView === 'history' && renderExpenseList()}
          </div>
        )}

        {view === 'income' && (
          <div>
            {!accessToken && (
              <button onClick={login} style={{ marginBottom: 20, background: '#5B8DEF', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px' }}>Googleでログイン</button>
            )}

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {subTabButton(incomeSubView === 'input', '✏️ 入力', () => setIncomeSubView('input'))}
              {subTabButton(incomeSubView === 'history', '📋 履歴', () => setIncomeSubView('history'))}
            </div>

            {incomeSubView === 'input' && (
              <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <label style={{ fontSize: 15, color: '#555' }}>
                  年月
                  <input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} style={{ ...BIG_DATE_STYLE, marginTop: 4 }} />
                </label>
                <AmountField label="支給額計(手当を除く)" value={totalPay} onChange={setTotalPay} />
                <AmountField label="控除額計" value={totalDeduction} onChange={setTotalDeduction} />
                <AmountField label="手当支給額" value={allowance} onChange={setAllowance} />
                <div style={{ background: '#E9F9F7', borderRadius: 8, padding: 12, fontSize: 15 }}>
                  <div>基本支給額(自動計算): {basicPay.toLocaleString()}円</div>
                  <div>手取り額(自動計算): {netPay.toLocaleString()}円</div>
                </div>
                <input placeholder="備考" value={incomeMemo} onChange={(e) => setIncomeMemo(e.target.value)} />
                <button onClick={addIncome} style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, padding: 12, fontWeight: 'bold', fontSize: 17 }}>記録する</button>
              </div>
            )}

            {incomeSubView === 'history' && renderIncomeList()}
          </div>
        )}

        {view === 'summary' && (
          <div>
            {!accessToken && (
              <button onClick={login} style={{ marginBottom: 20, background: '#5B8DEF', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px' }}>Googleでログイン</button>
            )}

            {accessToken && (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                  {subTabButton(summarySubView === 'chart', '📊 グラフ', () => setSummarySubView('chart'))}
                  {subTabButton(summarySubView === 'expenseList', '📋 支出一覧', () => setSummarySubView('expenseList'))}
                  {subTabButton(summarySubView === 'incomeList', '📋 収入一覧', () => setSummarySubView('incomeList'))}
                </div>

                {summarySubView === 'chart' && (
                  <>
                    <button onClick={loadSummaryData} style={{ marginBottom: 16, background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 15 }}>
                      {summaryLoading ? '読み込み中...' : '🔄 最新のデータを取得'}
                    </button>

                    {monthlySummary.length === 0 && !summaryLoading && <p style={{ color: '#888' }}>データが見つかりませんでした。</p>}

                    {monthlySummary.length > 0 && (
                      <>
                        <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}>
                          <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>月別 収支推移</div>
                          <div style={{ width: '100%', height: 220 }}>
                            <ResponsiveContainer>
                              <BarChart data={monthlySummary}>
                                <XAxis dataKey="month" fontSize={12} />
                                <YAxis fontSize={12} />
                                <Tooltip formatter={(v) => `${Number(v).toLocaleString()}円`} />
                                <Legend />
                                <Bar dataKey="income" name="収入" fill="#4ECDC4" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="expense" name="支出" fill="#FF7A5C" radius={[4, 4, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        <div style={{ marginBottom: 16 }}>
                          <label style={{ fontSize: 15, color: '#555' }}>
                            内訳を見る月
                            <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 4, padding: 10, borderRadius: 8, fontSize: 17 }}>
                              {availableMonths.map((m) => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                            </select>
                          </label>
                        </div>

                        {selectedSummary && (
                          <div style={{ background: theme.bg, borderRadius: 12, padding: 16, fontSize: 15, marginBottom: 16 }}>
                            <div>収入合計: {selectedSummary.income.toLocaleString()}円</div>
                            <div>支出合計: {selectedSummary.expense.toLocaleString()}円</div>
                            <div style={{ fontWeight: 'bold', fontSize: 20, marginTop: 4, color: theme.text }}>
                              収支: {selectedSummary.balance >= 0 ? '+' : ''}{selectedSummary.balance.toLocaleString()}円
                            </div>
                          </div>
                        )}

                        <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}>
                          <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>カテゴリ別 支出内訳({selectedMonth})</div>
                          {categoryBreakdown.length === 0 ? (
                            <p style={{ color: '#888' }}>この月の支出データがありません。</p>
                          ) : (
                            <div style={{ width: '100%', height: 260 }}>
                              <ResponsiveContainer>
                                <PieChart>
                                  <Pie data={categoryBreakdown} dataKey="value" nameKey="name" outerRadius={90} label={(entry) => entry.name}>
                                    {categoryBreakdown.map((entry, i) => (
                                      <Cell key={i} fill={categoryColor(entry.name)} />
                                    ))}
                                  </Pie>
                                  <Tooltip formatter={(v) => `${Number(v).toLocaleString()}円`} />
                                  <Legend />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                          )}
                        </div>

                        <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div style={{ fontSize: 16, fontWeight: 'bold' }}>🤖 AI分析コメント</div>
                            <button
                              onClick={() => handleGenerateComment(selectedMonth, monthlySummary, categoryBreakdown)}
                              style={{ background: theme.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 13 }}
                            >
                              {aiCommentLoading ? '生成中...' : '再生成'}
                            </button>
                          </div>
                          {aiComment ? (
                            <p style={{ fontSize: 15, lineHeight: 1.6, margin: 0 }}>{aiComment}</p>
                          ) : (
                            <p style={{ fontSize: 14, color: '#888', margin: 0 }}>{aiCommentLoading ? 'コメントを作成しています...' : 'データを読み込むと自動でコメントが表示されます。'}</p>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}

                {summarySubView === 'expenseList' && renderExpenseList()}
                {summarySubView === 'incomeList' && renderIncomeList()}
              </>
            )}
          </div>
        )}

        {view === 'paypay' && (
          <div>
            {!accessToken && (
              <button onClick={login} style={{ marginBottom: 20, background: '#5B8DEF', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px' }}>Googleでログイン</button>
            )}

            {accessToken && (
              <>
                <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', marginBottom: 16 }}>
                  <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8, color: theme.text }}>💰 PayPay取引履歴を取り込む</div>
                  <p style={{ fontSize: 13, color: '#888', marginTop: 0 }}>
                    PayPayアプリの「取引履歴」→ダウンロードでCSVファイルを取得し、ここで読み込んでください。すでに支出管理に登録済み(日付・金額が一致)の取引は自動で除外されます。
                  </p>
                  <label style={{ display: 'block', textAlign: 'center', padding: '14px 16px', background: theme.accent, color: '#fff', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 17 }}>
                    {paypayLoading ? '読み込み中...' : '📄 CSVファイルを選択'}
                    <input type="file" accept=".csv" onChange={handlePaypayCsv} style={{ display: 'none' }} disabled={paypayLoading} />
                  </label>
                </div>

                {paypayPreview.length > 0 && (
                  <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>
                      取り込みプレビュー({paypayPreview.filter((r) => r.include).length}件を記録)
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                      {paypayPreview.map((row, i) => (
                        <div key={i} style={{ border: '1px solid #eee', borderRadius: 8, padding: 10, opacity: row.include ? 1 : 0.4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <div style={{ fontSize: 13, color: categoryColor(row.category), fontWeight: 'bold' }}>{row.date}</div>
                              <div style={{ fontSize: 15 }}>{row.store}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontWeight: 'bold', fontSize: 16 }}>{row.amount.toLocaleString()}円</div>
                              <label style={{ fontSize: 12, color: '#888' }}>
                                <input type="checkbox" checked={row.include} onChange={(e) => updatePaypayPreviewRow(i, { include: e.target.checked })} /> 取り込む
                              </label>
                            </div>
                          </div>
                          <div style={{ marginTop: 8 }}>
                            <CategoryButtons value={row.category} onChange={(c) => updatePaypayPreviewRow(i, { category: c })} />
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={savePaypayPreview}
                      disabled={paypaySaving}
                      style={{ width: '100%', padding: 14, fontSize: 17, fontWeight: 'bold', background: theme.accent, color: '#fff', border: 'none', borderRadius: 8 }}
                    >
                      {paypaySaving ? '保存中...' : 'まとめて記録する'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <p style={{ textAlign: 'center', color: '#888', fontSize: 14 }}>{status}</p>
      </div>
    </div>
  )
}

export default App