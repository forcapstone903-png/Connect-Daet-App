'use client'

import { useEffect, useRef, useState } from 'react'
import { AtSign } from 'lucide-react'
import { useRouter } from 'next/navigation'

function getTextOffsetFromCaret(editor) {
  if (!editor || typeof window === 'undefined') return 0

  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) {
    return editor.textContent?.length || 0
  }

  const range = selection.getRangeAt(0)
  const preRange = range.cloneRange()
  preRange.selectNodeContents(editor)
  preRange.setEnd(range.startContainer, range.startOffset)
  return preRange.toString().length
}

function findTextPosition(editor, offset) {
  if (!editor || typeof document === 'undefined') {
    return { node: editor, offset: 0 }
  }

  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
  let currentOffset = 0
  let node = walker.nextNode()

  while (node) {
    const nextLength = currentOffset + (node.textContent || '').length
    if (offset <= nextLength) {
      return { node, offset: Math.max(0, offset - currentOffset) }
    }
    currentOffset = nextLength
    node = walker.nextNode()
  }

  return { node: editor, offset: editor.childNodes.length }
}

export default function MentionsAutoSuggest({ value, onChange, placeholder, rows = 3, onMentionAdded, userId }) {
  const router = useRouter()
  const editorRef = useRef(null)
  const suggestionRef = useRef(null)
  const debounceRef = useRef(null)
  const requestIdRef = useRef(0)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [mentionState, setMentionState] = useState(null)

  const fetchSuggestions = async (query = '') => {
    if (!userId) {
      setSuggestions([])
      return
    }

    const requestId = ++requestIdRef.current

    try {
      const response = await fetch(`/api/users/followers?q=${encodeURIComponent(query)}&limit=8`, {
        credentials: 'same-origin',
      })
      const result = await response.json().catch(() => ({}))

      if (requestId !== requestIdRef.current) return
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to load followers.')
      }

      setSuggestions(result.users || [])
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setSuggestions([])
      }
      if (error?.name !== 'AbortError') {
        console.error('Mention suggestions failed:', error)
      }
    }
  }

  const scheduleSuggestions = (query = '') => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current)
    }

    debounceRef.current = window.setTimeout(() => {
      void fetchSuggestions(query)
    }, 150)
  }

  const updateMentionState = (text, pos) => {
    if (!userId) {
      setMentionState(null)
      setShowSuggestions(false)
      setSuggestions([])
      return
    }

    const before = text.slice(0, pos)
    const lastAt = before.lastIndexOf('@')

    if (lastAt === -1) {
      setMentionState(null)
      setShowSuggestions(false)
      setSuggestions([])
      return
    }

    const query = before.slice(lastAt + 1)
    if (query.includes(' ')) {
      setMentionState(null)
      setShowSuggestions(false)
      setSuggestions([])
      return
    }

    setMentionState({ query, start: lastAt, end: pos })
    setShowSuggestions(true)
    setSelectedIndex(0)
    scheduleSuggestions(query)
  }

  const handleEditorChange = () => {
    const editor = editorRef.current
    if (!editor) return

    const text = editor.textContent || ''
    onChange(text)
    updateMentionState(text, getTextOffsetFromCaret(editor))
  }

  const handleEditorFocus = () => {
    const editor = editorRef.current
    if (!editor) return

    const text = editor.textContent || ''
    updateMentionState(text, getTextOffsetFromCaret(editor))
  }

  const insertMention = (user) => {
    const editor = editorRef.current
    if (!editor || !mentionState) return

    const { start, end } = mentionState
    const displayName = user.full_name || user.email?.split('@')[0] || 'user'
    const mentionText = displayName

    const range = document.createRange()
    const startRef = findTextPosition(editor, start)
    const endRef = findTextPosition(editor, end)

    range.setStart(startRef.node, startRef.offset)
    range.setEnd(endRef.node, endRef.offset)
    range.deleteContents()

    const mentionNode = document.createElement('span')
    mentionNode.className = 'inline-flex items-center rounded-md bg-sky-100 px-1.5 py-0.5 font-bold text-sky-700'
    mentionNode.contentEditable = 'false'
    mentionNode.dataset.userId = String(user.id)
    mentionNode.dataset.displayName = displayName
    mentionNode.textContent = mentionText
    mentionNode.setAttribute('role', 'link')
    mentionNode.tabIndex = 0

    const handleMentionClick = (event) => {
      event.preventDefault()
      event.stopPropagation()
      if (user?.id) {
        router.push(`/user/profile/${encodeURIComponent(user.id)}`)
      }
    }

    mentionNode.onclick = handleMentionClick
    mentionNode.onkeydown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        handleMentionClick(event)
      }
    }

    range.insertNode(mentionNode)

    const trailingSpace = document.createTextNode(' ')
    mentionNode.parentNode?.insertBefore(trailingSpace, mentionNode.nextSibling)

    const selection = window.getSelection()
    if (selection) {
      const cursorRange = document.createRange()
      cursorRange.setStartAfter(trailingSpace)
      cursorRange.collapse(true)
      selection.removeAllRanges()
      selection.addRange(cursorRange)
    }

    editor.focus()

    setShowSuggestions(false)
    setSuggestions([])
    setMentionState(null)

    if (onMentionAdded) {
      onMentionAdded(user)
    }

    onChange(editor.textContent || '')
  }

  const handleKeyDown = (event) => {
    if (!showSuggestions || suggestions.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (event.key === 'Enter' || event.key === 'Tab') {
      const selected = suggestions[selectedIndex]
      if (selected) {
        event.preventDefault()
        insertMention(selected)
      }
    } else if (event.key === 'Escape') {
      setShowSuggestions(false)
      setSuggestions([])
      setMentionState(null)
    }
  }

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    const nextValue = String(value || '')
    const currentText = editor.textContent || ''

    if (currentText !== nextValue) {
      editor.textContent = nextValue
    }
  }, [value])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        suggestionRef.current &&
        !suggestionRef.current.contains(event.target) &&
        !editorRef.current?.contains(event.target)
      ) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current)
      }
      requestIdRef.current += 1
    }
  }, [])

  return (
    <div className="relative">
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleEditorChange}
        onFocus={handleEditorFocus}
        onKeyDown={handleKeyDown}
        data-placeholder={placeholder}
        style={{ minHeight: `${Math.max(rows, 1) * 1.5}rem` }}
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
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
              <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-sky-500 to-violet-600 text-[10px] font-bold text-white">
                {user.profile_image_url ? (
                  <img src={user.profile_image_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  (user.full_name || 'U')[0]?.toUpperCase()
                )}
              </div>
              <span className="font-semibold">{user.full_name || user.email || 'User'}</span>
              <span className="ml-auto truncate text-xs text-slate-400">{user.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
