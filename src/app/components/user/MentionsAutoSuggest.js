'use client'

import { useEffect, useRef, useState } from 'react'
import { AtSign } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function MentionsAutoSuggest({ value, onChange, placeholder, rows = 3, onMentionAdded }) {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [mentionQuery, setMentionQuery] = useState('')
  const [cursorPos, setCursorPos] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)
  const suggestionRef = useRef(null)

  const extractMention = (text, pos) => {
    const before = text.slice(0, pos)
    const match = before.match(/@(\w*)$/)
    return match ? { query: match[1], start: pos - match[0].length, end: pos } : null
  }

  const fetchSuggestions = async (query) => {
    if (!query) {
      setSuggestions([])
      return
    }
    try {
      const { data, error } = await supabase
        .from('info_users')
        .select('id, full_name, email, profile_image_url')
        .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(5)
      if (error) throw error
      setSuggestions(data || [])
    } catch (err) {
      console.error('Mention suggestions failed:', err)
      setSuggestions([])
    }
  }

  const handleChange = (e) => {
    const text = e.target.value
    const pos = e.target.selectionStart || 0
    onChange(text)
    setCursorPos(pos)

    const mention = extractMention(text, pos)
    if (mention) {
      setMentionQuery(mention.query)
      setShowSuggestions(true)
      setSelectedIndex(0)
      fetchSuggestions(mention.query)
    } else {
      setShowSuggestions(false)
      setSuggestions([])
    }
  }

  const insertMention = (user) => {
    if (!inputRef.current) return
    const before = value.slice(0, mentionStart)
    const after = value.slice(cursorPos)
    const newValue = `${before}@${user.full_name || user.email?.split('@')[0] || 'user'} ${after}`
    onChange(newValue)
    setShowSuggestions(false)
    setSuggestions([])
    if (onMentionAdded) onMentionAdded(user)
    // Focus back on input
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      const newPos = before.length + (user.full_name || user.email?.split('@')[0] || 'user').length + 2
      inputRef.current?.setSelectionRange(newPos, newPos)
    })
  }

  // Track mention start for insertion
  const mentionStart = (() => {
    if (!showSuggestions) return cursorPos
    const before = value.slice(0, cursorPos)
    const lastAt = before.lastIndexOf('@')
    return lastAt >= 0 ? lastAt : cursorPos
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
        insertMention(suggestions[selectedIndex])
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
        onFocus={(e) => {
          const mention = extractMention(e.target.value, e.target.selectionStart || 0)
          if (mention) {
            setCursorPos(e.target.selectionStart || 0)
            setMentionQuery(mention.query)
            setShowSuggestions(true)
            fetchSuggestions(mention.query)
          }
        }}
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
            <AtSign className="mr-1 inline h-3 w-3" /> Mention a user
          </div>
          {suggestions.map((user, index) => (
            <button
              key={user.id}
              type="button"
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => insertMention(user)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${
                selectedIndex === index ? 'bg-sky-50 text-sky-700' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-sky-500 to-violet-600 text-[10px] font-bold text-white">
                {user.profile_image_url ? (
                  <img src={user.profile_image_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  (user.full_name || 'U')[0]?.toUpperCase()
                )}
              </div>
              <span className="font-semibold">{user.full_name}</span>
              <span className="ml-auto truncate text-xs text-slate-400">{user.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}