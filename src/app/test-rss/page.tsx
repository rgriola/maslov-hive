'use client';

import { useState } from 'react';

export default function TestRSSPage() {
  const [query, setQuery] = useState('artificial intelligence');
  const [rawXml, setRawXml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRSS = async () => {
    setLoading(true);
    setError(null);
    setRawXml(null);

    try {
      const encodedQuery = encodeURIComponent(query);
      const url = `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-US&gl=US&ceid=US:en`;
      
      // Use a CORS proxy or fetch directly (may fail due to CORS)
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const xml = await response.text();
      setRawXml(xml);
    } catch (err) {
      // Try with a CORS proxy as fallback
      try {
        const encodedQuery = encodeURIComponent(query);
        const url = `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-US&gl=US&ceid=US:en`;
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        
        const response = await fetch(proxyUrl);
        if (!response.ok) {
          throw new Error(`Proxy HTTP ${response.status}`);
        }
        const xml = await response.text();
        setRawXml(xml);
      } catch (proxyErr) {
        setError(`CORS blocked. Run this in terminal instead:\ncurl "https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en"`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      padding: '24px', 
      maxWidth: '1200px', 
      margin: '0 auto',
      fontFamily: 'system-ui, sans-serif',
      background: '#0a0a1a',
      minHeight: '100vh',
      color: '#e0e0ff',
    }}>
      <h1 style={{ marginBottom: '24px' }}>🧪 Google News RSS Test</h1>
      
      <div style={{ marginBottom: '20px', display: 'flex', gap: '12px' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search query..."
          style={{
            flex: 1,
            padding: '12px 16px',
            fontSize: '16px',
            border: '1px solid #333',
            borderRadius: '8px',
            background: '#1a1a2e',
            color: '#e0e0ff',
          }}
          onKeyDown={(e) => e.key === 'Enter' && fetchRSS()}
        />
        <button
          onClick={fetchRSS}
          disabled={loading}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            background: loading ? '#333' : '#4a9eff',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Fetching...' : 'Fetch RSS'}
        </button>
      </div>

      <div style={{ 
        marginBottom: '16px', 
        padding: '12px', 
        background: '#1a1a2e', 
        borderRadius: '8px',
        fontSize: '13px',
        fontFamily: 'monospace',
      }}>
        <strong>URL:</strong>{' '}
        <code style={{ color: '#60a5fa' }}>
          https://news.google.com/rss/search?q={encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en
        </code>
      </div>

      {error && (
        <div style={{
          padding: '16px',
          background: 'rgba(239, 68, 68, 0.2)',
          border: '1px solid rgba(239, 68, 68, 0.5)',
          borderRadius: '8px',
          marginBottom: '20px',
          whiteSpace: 'pre-wrap',
          fontFamily: 'monospace',
          fontSize: '13px',
        }}>
          {error}
        </div>
      )}

      {rawXml && (
        <div>
          <h2 style={{ marginBottom: '12px' }}>Raw XML Output:</h2>
          <pre style={{
            padding: '16px',
            background: '#1a1a2e',
            border: '1px solid #333',
            borderRadius: '8px',
            overflow: 'auto',
            maxHeight: '600px',
            fontSize: '12px',
            lineHeight: '1.5',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}>
            {rawXml}
          </pre>
          
          <h2 style={{ marginTop: '24px', marginBottom: '12px' }}>Parsed Items:</h2>
          <ParsedItems xml={rawXml} />
        </div>
      )}

      <div style={{ 
        marginTop: '32px', 
        padding: '16px', 
        background: '#1a1a2e', 
        borderRadius: '8px',
        fontSize: '13px',
      }}>
        <strong>💡 Tip:</strong> If CORS blocks the request, run this in your terminal:
        <pre style={{ 
          marginTop: '8px', 
          padding: '12px', 
          background: '#0a0a1a', 
          borderRadius: '4px',
          overflow: 'auto',
        }}>
          curl &quot;https://news.google.com/rss/search?q={encodeURIComponent(query)}&amp;hl=en-US&amp;gl=US&amp;ceid=US:en&quot;
        </pre>
      </div>
    </div>
  );
}

function ParsedItems({ xml }: { xml: string }) {
  const items: { title: string; link: string; pubDate: string; source: string }[] = [];
  
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  const titleRegex = /<title>([\s\S]*?)<\/title>/;
  const linkRegex = /<link>([\s\S]*?)<\/link>/;
  const pubDateRegex = /<pubDate>([\s\S]*?)<\/pubDate>/;
  const sourceRegex = /<source[^>]*>([\s\S]*?)<\/source>/;
  
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const title = item.match(titleRegex)?.[1] || '';
    const link = item.match(linkRegex)?.[1] || '';
    const pubDate = item.match(pubDateRegex)?.[1] || '';
    const source = item.match(sourceRegex)?.[1] || '';
    
    items.push({ title, link, pubDate, source });
  }

  if (items.length === 0) {
    return <p style={{ color: '#888' }}>No items found in XML</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {items.map((item, i) => (
        <div key={i} style={{
          padding: '16px',
          background: '#1a1a2e',
          border: '1px solid #333',
          borderRadius: '8px',
        }}>
          <div style={{ fontWeight: 600, marginBottom: '8px', color: '#4a9eff' }}>
            {item.title}
          </div>
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
            <strong>Source:</strong> {item.source || 'N/A'}
          </div>
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '4px' }}>
            <strong>Date:</strong> {item.pubDate}
          </div>
          <div style={{ fontSize: '11px', color: '#666', wordBreak: 'break-all' }}>
            <strong>Link:</strong> {item.link}
          </div>
        </div>
      ))}
    </div>
  );
}
