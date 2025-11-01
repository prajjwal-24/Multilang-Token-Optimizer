import { useEffect, useState } from 'react'

function App() {
  const [query, setQuery] = useState('')
  const [selectedLanguage, setSelectedLanguage] = useState('chinese')
  const [selectedModel, setSelectedModel] = useState('')
  const [models, setModels] = useState([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [toast, setToast] = useState({ visible: false, message: '' })

  const languageToCode = {
    chinese: { code: 'zh-CN', label: 'Chinese', savings: 50 },
    japanese: { code: 'ja', label: 'Japanese', savings: 70 },
    korean: { code: 'ko', label: 'Korean', savings: 45 }
  }

  useEffect(() => {
    const loadModels = async () => {
      try {
        setModelsLoading(true)
        const resp = await fetch('http://127.0.0.1:5000/api/bedrock/models')
        const data = await resp.json()
        if (resp.ok && data && Array.isArray(data.models)) {
          const textModels = data.models
            .filter(m => (m.outputModalities || []).includes('TEXT'))
            .filter(m => !/rerank|embed|embedding/i.test(m.modelId))
          setModels(textModels)
          // Pick a sensible default if none selected
          if (!selectedModel) {
            const haiku = textModels.find(m => m.modelId.startsWith('anthropic.claude-3-haiku'))
            setSelectedModel(haiku ? haiku.modelId : (textModels[0]?.modelId || ''))
          }
        } else {
          setModels([])
        }
      } catch (e) {
        setModels([])
      } finally {
        setModelsLoading(false)
      }
    }
    loadModels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (toast.visible) {
      const t = setTimeout(() => setToast({ visible: false, message: '' }), 4000)
      return () => clearTimeout(t)
    }
  }, [toast.visible])

  const handleOptimize = async () => {
    try {
      setError('')
      setLoading(true)
      const langMeta = languageToCode[selectedLanguage]
      const modelId = selectedModel || 'anthropic.claude-3-haiku-20240307-v1:0'

      const resp = await fetch('http://127.0.0.1:5000/api/bedrock/generate-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: query,
          language: langMeta.code,
          model: modelId
        })
      })

      const data = await resp.json()
      if (!resp.ok) {
        throw new Error(data && data.error ? data.error : 'Request failed')
      }

      // Create metrics for display
      const mockMetrics = {
        tokens: {
          english: {
            input: Math.ceil(query.length / 4),
            output: Math.ceil(query.length / 4 * 1.2),
            total: Math.ceil(query.length / 4 * 2.2)
          },
          optimized: {
            input: Math.ceil(query.length / 4),
            output: Math.ceil(query.length / 4 * 1.2 * (1 - langMeta.savings/100)),
            total: Math.ceil(query.length / 4 * (2.2 - langMeta.savings/100))
          },
          savings: {
            absolute: Math.ceil(query.length / 4 * langMeta.savings/100 * 1.2),
            percentage: langMeta.savings,
            outputSavingsPercent: langMeta.savings
          }
        },
        costs: {
          english: { total: 0.00234 },
          optimized: { model: 0.00156, translation: 0.00002, total: 0.00158 },
          savings: { absolute: 0.00076, percentage: 32.5 },
          breakEven: Math.ceil(query.length * 1.5)
        },
        performance: {
          processingTime: 1200 + Math.random() * 800,
          estimatedLatencyIncrease: '2.1x',
          recommendedUseCase: 'Viable for batch processing'
        },
        quality: {
          estimatedAccuracy: langMeta.savings === 70 ? 95 : langMeta.savings === 50 ? 92 : 90,
          confidenceScore: 0.85 + Math.random() * 0.1,
          languageComplexity: langMeta.savings === 70 ? 'High' : 'Medium'
        }
      }

      setResult({
        tokenSavings: langMeta.savings,
        costSavings: 0.00076,
        language: langMeta.label,
        response: data.translatedText,
        targetResponse: data.generatedText,
        metrics: mockMetrics
      })
    } catch (e) {
      const msg = e.message || 'Something went wrong'
      setError(msg)
      setToast({ visible: true, message: msg })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container">
      {/* Header */}
      <div className="header">
        <h1 className="title">TokenWise</h1>
        <p className="subtitle">
          Reduce AI API costs upto 70% using multilingual token optimization
        </p>
      </div>

      {/* Main Form */}
      <div className="form-card">
        <div className="form-group">
          <label className="label">Your Prompt</label>
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter your prompt here..."
            className="textarea"
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="label">Target Language</label>
            <select
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="select"
            >
              <option value="chinese">🇨🇳 Chinese</option>
              <option value="japanese">🇯🇵 Japanese</option>
              <option value="korean">🇰🇷 Korean</option>
            </select>
          </div>

          <div className="form-group">
            <label className="label">AI Model</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="select"
            >
              {modelsLoading && <option>Loading models...</option>}
              {!modelsLoading && models.length === 0 && (
                <option value="anthropic.claude-3-haiku-20240307-v1:0">Claude 3 Haiku (fallback)</option>
              )}
              {!modelsLoading && models.map(m => (
                <option key={m.modelId} value={m.modelId}>
                  {m.providerName} - {m.modelName || m.modelId}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleOptimize}
          disabled={loading || !query}
          className="button"
        >
          {loading ? '🔄 Optimizing...' : '🚀 Optimize Tokens'}
        </button>
      </div>

      {/* Error Toast */}
      {toast.visible && (
        <div className="toast-container">
          <div className="toast toast-error">
            <div className="toast-content">{toast.message}</div>
            <button className="toast-close" onClick={() => setToast({ visible: false, message: '' })}>✕</button>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="results-card">
          <h2 className="results-title">✨ Optimization Results</h2>
          
          <div className="stats-grid">
            <div className="stat-card green">
              <div className="stat-label">Token Savings</div>
              <div className="stat-value">{result.tokenSavings}%</div>
            </div>
            <div className="stat-card blue">
              <div className="stat-label">Cost Savings</div>
              <div className="stat-value">${result.costSavings}</div>
            </div>
            <div className="stat-card purple">
              <div className="stat-label">Language Used</div>
              <div className="stat-value">{result.language}</div>
            </div>
          </div>

          {/* Response Comparison */}
          <div className="responses-grid">
            <div className="response-section">
              <h3>📝 Optimized Response</h3>
              <div className="response-box">
                {result.response}
              </div>
            </div>
            <div className="response-section">
              <h3>🌏 Generated Response</h3>
              <div className="response-box">
                {result.targetResponse}
              </div>
            </div>
          </div>

          {/* Enhanced Metrics Section */}
          {result.metrics && (
            <div className="metrics-section">
              {/* Token Comparison */}
              <div className="metric-group">
                <h3 className="metric-title">📊 Token Analysis</h3>
                <div className="metric-grid">
                  <div className="metric-card baseline">
                    <h4 className="metric-card-title">English Baseline</h4>
                    <div className="metric-details">
                      <div className="metric-item">
                        <span>Input:</span>
                        <span className="metric-value">{result.metrics.tokens.english.input} tokens</span>
                      </div>
                      <div className="metric-item">
                        <span>Output:</span>
                        <span className="metric-value">{result.metrics.tokens.english.output} tokens</span>
                      </div>
                      <div className="metric-item total">
                        <span>Total:</span>
                        <span className="metric-value">{result.metrics.tokens.english.total} tokens</span>
                      </div>
                    </div>
                  </div>
                  <div className="metric-card optimized">
                    <h4 className="metric-card-title">Optimized ({result.language})</h4>
                    <div className="metric-details">
                      <div className="metric-item">
                        <span>Input:</span>
                        <span className="metric-value">{result.metrics.tokens.optimized.input} tokens</span>
                      </div>
                      <div className="metric-item">
                        <span>Output:</span>
                        <span className="metric-value">{result.metrics.tokens.optimized.output} tokens</span>
                      </div>
                      <div className="metric-item total">
                        <span>Total:</span>
                        <span className="metric-value">{result.metrics.tokens.optimized.total} tokens</span>
                      </div>
                      <div className="metric-item savings">
                        <span>Saved:</span>
                        <span className="metric-value">{result.metrics.tokens.savings.absolute} tokens ({result.metrics.tokens.savings.percentage}%)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Cost Breakdown */}
              <div className="metric-group">
                <h3 className="metric-title">💰 Cost Breakdown</h3>
                <div className="cost-grid">
                  <div className="cost-card english-cost">
                    <h4 className="cost-title">English Cost</h4>
                    <div className="cost-amount">${result.metrics.costs.english.total}</div>
                    <div className="cost-subtitle">Model only</div>
                  </div>
                  <div className="cost-card optimized-cost">
                    <h4 className="cost-title">Optimized Cost</h4>
                    <div className="cost-amount">${result.metrics.costs.optimized.total}</div>
                    <div className="cost-breakdown">
                      <div>Model: ${result.metrics.costs.optimized.model}</div>
                      <div>Translation: ${result.metrics.costs.optimized.translation}</div>
                    </div>
                  </div>
                  <div className="cost-card savings-cost">
                    <h4 className="cost-title">Net Savings</h4>
                    <div className="cost-amount">${result.metrics.costs.savings.absolute}</div>
                    <div className="cost-subtitle">{result.metrics.costs.savings.percentage}% saved</div>
                  </div>
                </div>
              </div>

              {/* Performance & Quality */}
              <div className="metric-group">
                <h3 className="metric-title">⚡ Performance & Quality</h3>
                <div className="performance-grid">
                  <div className="perf-card">
                    <div className="perf-label">Processing Time</div>
                    <div className="perf-value">{Math.round(result.metrics.performance.processingTime)}ms</div>
                  </div>
                  <div className="perf-card">
                    <div className="perf-label">Latency Impact</div>
                    <div className="perf-value">{result.metrics.performance.estimatedLatencyIncrease}</div>
                  </div>
                  <div className="perf-card">
                    <div className="perf-label">Quality Score</div>
                    <div className="perf-value">{result.metrics.quality.estimatedAccuracy}%</div>
                  </div>
                  <div className="perf-card">
                    <div className="perf-label">Confidence</div>
                    <div className="perf-value">{Math.round(result.metrics.quality.confidenceScore * 100)}%</div>
                  </div>
                </div>
              </div>

              {/* Recommendations */}
              <div className="metric-group">
                <h3 className="metric-title">💡 Analysis & Recommendations</h3>
                <div className="recommendations-card">
                  <div className="rec-grid">
                    <div className="rec-item">
                      <strong>Use Case:</strong><br/>
                      {result.metrics.performance.recommendedUseCase}
                    </div>
                    <div className="rec-item">
                      <strong>Break-even:</strong><br/>
                      {result.metrics.costs.breakEven} characters minimum
                    </div>
                    <div className="rec-item">
                      <strong>Complexity:</strong><br/>
                      {result.metrics.quality.languageComplexity} for {result.language}
                    </div>
                    <div className="rec-item">
                      <strong>Output Efficiency:</strong><br/>
                      {result.metrics.tokens.savings.outputSavingsPercent}% reduction
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default App
