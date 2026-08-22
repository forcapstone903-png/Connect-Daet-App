'use client'

import { useEffect, useRef, useState } from 'react'
import { Hash, TrendingUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function HashtagSuggest({ value, onChange, placeholder, rows = 3, onHashtagAdded }) {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [hashtagQuery, setHashtagQuery] = useState('')
  const [cursorPos, setCursorPos] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)
  const suggestionRef = useRef(null)

  const extractHashtag = (text, pos) => {
    const before = text.slice(0, pos)
    const match = before.match(/#(\w*)$/)
    return match ? { query: match[1], start: pos - match[0].length, end: pos } : null
  }

  const fetchSuggestions = async (query) => {
    try {
      const { data, error } = await supabase
        .from('hashtags')
        .select('id, name, usage_count, is_trending')
        .or(`name.ilike.%${query}%`)
        .order('usage_count', { ascending: false })
        .limit(5)
      if (error) throw error
      setSuggestions(data || [])
    } catch (err) {
      console.error('Hashtag suggestions failed:', err)
      setSuggestions([])
    }
  }

  const handleChange = (e) => {
    const text = e.target.value
    const pos = e.target.selectionStart || 0
    onChange(text)
    setCursorPos(pos)

    const hashtag = extractHashtag(text, pos)
    if (hashtag) {
      setHashtagQuery(hashtag.query)
      setShowSuggestions(true)
      setSelectedIndex(0)
      fetchSuggestions(hashtag.query)
    } else {
      setShowSuggestions(false)
      setSuggestions([])
    }
  }

  const insertHashtag = (tag) => {
    if (!inputRef.current) return
    const before = value.slice(0, hashtagStart)
    const after = value.slice(cursorPos)
    const newValue = `${before}#${tag.name} ${after}`
    onChange(newValue)
    setShowSuggestions(false)
    setSuggestions([])
    if (onHashtagAdded) onHashtagAdded(tag)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      const newPos = before.length + tag.name.length + 2
      inputRef.current?.setSelectionRange(newPos, newPos)
    })
  }

  const hashtagStart = (() => {
    if (!showSuggestions) return cursorPos
    const before = value.slice(0, cursorPos)
    const lastHash = before.lastIndexOf('#')
    return lastHash >= 0 ? lastHash : cursorPos
  })()

  const handleKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (suggestions[selectedIndex]) {
        e.preventDefault()
        insertHashtag(suggestions[selectedIndex])
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (suggestionRef.current && !suggestionRef.current.contains(e.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative">
      <textarea
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-300"
      />

      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionRef}
          className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-lg"
        >
          <div className="border-b border-slate-100 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <Hash className="mr-1 inline h-3 w-3" /> Trending hashtags
          </div>
          {suggestions.map((tag, index) => (
            <button
              key={tag.id}
              type="button"
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => insertHashtag(tag)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${
                selectedIndex === index ? 'bg-sky-50 text-sky-700' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Hash className="h-4 w-4 flex-shrink-0 text-sky-500" />
              <span className="font-semibold">#{tag.name}</span>
              {tag.is_trending && <TrendingUp className="h-3 w-3 text-emerald-500" />}
              <span className="ml-auto text-xs text-slate-400">{tag.usage_count} uses</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}