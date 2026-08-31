import { useState, useEffect, useRef } from 'react'
import './App.css'

const SPREADSHEET_ID = '1qmR0AXUvBDVo7u7PI15GLsRdho0M5W-ko0n3X8B7E7g'
const EXPENSE_SHEET = '支出管理'
const INCOME_SHEET = '収入管理'
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets'

const TOKEN_KEY = 'gapp_token'
const EXPIRY_KEY = 'gapp_token_expiry'

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function askGemini(file, prompt) {
  const base64 = await fileToBase64(file)

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: file.type, data: base64 } },
            ],
          },
        ],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    }
  )

  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text

  if (!text) {
    throw new Error(data.error?.message || '読み取りに失敗しました')
  }

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
  return askGemini(file, prompt)
}

function analyzePayslip(file) {
  const prompt = `これは給料明細の画像です。以下の項目をJSON形式だけで答えてください。前置きや説明は不要です。
{
  "date": "YYYY-MM-DD形式の支給日(年が無ければ${new Date().getFullYear()}年として補完)",
  "company": "会社名・勤務先名",
  "base": "基本給(数字のみ、カンマや円マークなし)",
  "allowance": "各種手当の合計金額(残業手当・通勤手当・住宅手当などをすべて合計した数字のみ)",
  "deduction": "控除額の合計(税金・社会保険料などの合計、数字のみ)",
  "net": "差引支給額・手取り額(数字のみ)"
}
読み取れない項目は空文字にしてください。`
  return askGemini(file, prompt)
}

function App() {
  const [accessToken, setAccessToken] = useState(null)
  const [view, setView] = useState('expense')
  const [status, setStatus] = useState('')
  const [scanning, setScanning] = useState(false)
  const tokenClientRef = useRef(null)

  const [date, setDate] = useState('')
  const [store, setStore] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [memo, setMemo] = useState('')

  const [payDate, setPayDate] = useState('')
  const [company, setCompany] = useState('')
  const [base, setBase] = useState('')
  const [allowance, setAllowance] = useState('')
  const [deduction, setDeduction] = useState('')
  const [net, setNet] = useState('')
  const [incomeMemo, setIncomeMemo] = useState('')

  const saveToken = (token, expiresInSeconds) => {
    const expiryTime = Date.now() + expiresInSeconds * 1000
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(EXPIRY_KEY, String(expiryTime))
    setAccessToken(token)
  }

  const clearToken = () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EXPIRY_KEY)
    setAccessToken(null)
  }

  useEffect(() => {
    const initClient = () => {
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: (response) => {
          if (response.access_token) {
            saveToken(response.access_token, response.expires_in)
            setStatus('ログイン成功!')
          }
        },
      })

      const savedToken = localStorage.getItem(TOKEN_KEY)
      const savedExpiry = Number(localStorage.getItem(EXPIRY_KEY))

      if (savedToken && savedExpiry > Date.now()) {
        setAccessToken(savedToken)
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

  const login = () => {
    tokenClientRef.current.requestAccessToken({ prompt: 'consent' })
  }

  const logout = () => {
    clearToken()
    setStatus('ログアウトしました')
  }

  const appendRow = async (sheetName, row) => {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}!A:Z:append?valueInputOption=USER_ENTERED`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
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

  const handleReceiptImage = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setScanning(true)
    setStatus('レシートを読み取っています...')
    try {
      const result = await analyzeReceipt(file)
      if (result.date) setDate(result.date)
      if (result.store) setStore(result.store)
      if (result.amount) setAmount(result.amount)
      if (result.category) setCategory(result.category)
      setStatus('読み取りました。内容を確認して「記録する」を押してください。')
    } catch (err) {
      setStatus('読み取りエラー: ' + err.message)
    } finally {
      setScanning(false)
    }
  }

  const handlePayslipImage = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setScanning(true)
    setStatus('給料明細を読み取っています...')
    try {
      const result = await analyzePayslip(file)
      if (result.date) setPayDate(result.date)
      if (result.company) setCompany(result.company)
      if (result.base) setBase(result.base)
      if (result.allowance) setAllowance(result.allowance)
      if (result.deduction) setDeduction(result.deduction)
      if (result.net) setNet(result.net)
      setStatus('読み取りました。内容を確認して「記録する」を押してください。')
    } catch (err) {
      setStatus('読み取りエラー: ' + err.message)
    } finally {
      setScanning(false)
    }
  }

  const addExpense = async () => {
    if (!accessToken) {
      setStatus('先にログインしてください')
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
        setAmount('')
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
    setStatus('保存中...')
    const id = Math.random().toString(16).slice(2, 10)
    const row = [id, '', payDate, company, base, allowance, deduction, net, incomeMemo]
    try {
      const ok = await appendRow(INCOME_SHEET, row)
      if (ok) {
        setStatus('保存しました!')
        setPayDate('')
        setCompany('')
        setBase('')
        setAllowance('')
        setDeduction('')
        setNet('')
        setIncomeMemo('')
      }
    } catch (err) {
      setStatus('エラー: ' + err.message)
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h1 style={{ fontSize: 22 }}>家計簿アプリ</h1>
        <button onClick={() => setView('settings')}>設定</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          onClick={() => setView('expense')}
          style={{ fontWeight: view === 'expense' ? 'bold' : 'normal' }}
        >
          支出
        </button>
        <button
          onClick={() => setView('income')}
          style={{ fontWeight: view === 'income' ? 'bold' : 'normal' }}
        >
          収入
        </button>
      </div>

      {view === 'settings' && (
        <div>
          <p>ログイン状態: {accessToken ? 'ログイン済み' : '未ログイン'}</p>
          {accessToken ? (
            <button onClick={logout}>ログアウト</button>
          ) : (
            <button onClick={login}>Googleでログイン</button>
          )}
          <div style={{ marginTop: 20 }}>
            <button onClick={() => setView('expense')}>戻る</button>
          </div>
        </div>
      )}

      {view === 'expense' && (
        <div>
          {!accessToken && (
            <button onClick={login} style={{ marginBottom: 20 }}>
              Googleでログイン
            </button>
          )}

          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: 'inline-block',
                padding: '10px 16px',
                background: '#eee',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              {scanning ? '読み取り中...' : '📷 レシートを撮影する'}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleReceiptImage}
                style={{ display: 'none' }}
                disabled={scanning}
              />
            </label>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <input placeholder="店舗名" value={store} onChange={(e) => setStore(e.target.value)} />
            <input placeholder="金額" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <input placeholder="カテゴリ" value={category} onChange={(e) => setCategory(e.target.value)} />
            <input placeholder="備考" value={memo} onChange={(e) => setMemo(e.target.value)} />
            <button onClick={addExpense}>記録する</button>
          </div>
        </div>
      )}

      {view === 'income' && (
        <div>
          {!accessToken && (
            <button onClick={login} style={{ marginBottom: 20 }}>
              Googleでログイン
            </button>
          )}

          <div style={{ marginBottom: 20 }}>
            <label
              style={{
                display: 'inline-block',
                padding: '10px 16px',
                background: '#eee',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              {scanning ? '読み取り中...' : '📷 給料明細を撮影する'}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePayslipImage}
                style={{ display: 'none' }}
                disabled={scanning}
              />
            </label>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
            <input placeholder="会社名" value={company} onChange={(e) => setCompany(e.target.value)} />
            <input placeholder="基本給" type="number" value={base} onChange={(e) => setBase(e.target.value)} />
            <input placeholder="手当合計" type="number" value={allowance} onChange={(e) => setAllowance(e.target.value)} />
            <input placeholder="控除額" type="number" value={deduction} onChange={(e) => setDeduction(e.target.value)} />
            <input placeholder="手取り額" type="number" value={net} onChange={(e) => setNet(e.target.value)} />
            <input placeholder="備考" value={incomeMemo} onChange={(e) => setIncomeMemo(e.target.value)} />
            <button onClick={addIncome}>記録する</button>
          </div>
        </div>
      )}

      <p>{status}</p>
    </div>
  )
}

export default App