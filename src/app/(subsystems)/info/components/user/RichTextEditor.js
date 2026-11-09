'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading1,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Plus,
  Quote,
  Underline,
  Video,
} from 'lucide-react'

const toolbarItems = [
  { label: 'Bold', icon: Bold, command: 'bold', state: 'bold' },
  { label: 'Italic', icon: Italic, command: 'italic', state: 'italic' },
  { label: 'Underline', icon: Underline, command: 'underline', state: 'underline' },
  { label: 'Heading 1', icon: Heading1, command: 'formatBlock', value: 'h1', state: 'h1' },
  { label: 'Heading 2', icon: Heading2, command: 'formatBlock', value: 'h2', state: 'h2' },
  { label: 'Quote', icon: Quote, command: 'formatBlock', value: 'blockquote', state: 'blockquote' },
  { label: 'Bulleted list', icon: List, command: 'insertUnorderedList', state: 'ul' },
  { label: 'Numbered list', icon: ListOrdered, command: 'insertOrderedList', state: 'ol' },
  { label: 'Paragraph', icon: Minus, command: 'formatBlock', value: 'p', state: 'p' },
  { label: 'Align left', icon: AlignLeft, command: 'justifyLeft' },
  { label: 'Align center', icon: AlignCenter, command: 'justifyCenter' },
  { label: 'Align right', icon: AlignRight, command: 'justifyRight' },
]

function isInsideEditor(editor, node) {
  return Boolean(editor && node && (node === editor || editor.contains(node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode)))
}

function currentBlock(editor, node) {
  let element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement
  while (element && element !== editor) {
    if (/^(P|DIV|H1|H2|BLOCKQUOTE|LI)$/.test(element.tagName)) return element
    element = element.parentElement
  }
  return null
}

function safeMediaUrl(value) {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character])
}

const RichTextEditor = forwardRef(function RichTextEditor({
  initialValue = '',
  contentRevision = 0,
  onChange,
  onWordCountChange,
  images = [],
  onOpenMediaSettings,
  onUploadFiles,
  onEditorBlur,
}, ref) {
  const editorRef = useRef(null)
  const initialValueRef = useRef(initialValue)
  const toolbarRef = useRef(null)
  const touchToolbarRef = useRef(null)
  const linkInputRef = useRef(null)
  const savedRangeRef = useRef(null)
  const selectionRectRef = useRef(null)
  const isComposingRef = useRef(false)
  const imageActionsRef = useRef(null)
  const imageReplaceTargetRef = useRef(null)
  const appliedContentRevisionRef = useRef(contentRevision)
  const callbacksRef = useRef({ onChange, onWordCountChange, onOpenMediaSettings, onUploadFiles, onEditorBlur })
  const [toolbar, setToolbar] = useState({ visible: false, left: 0, top: 0, active: {} })
  const [linkEditorOpen, setLinkEditorOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkError, setLinkError] = useState('')
  const [plusButton, setPlusButton] = useState({ visible: false, left: 0, top: 0 })
  const [insertMenuOpen, setInsertMenuOpen] = useState(false)
  const [imageMenuOpen, setImageMenuOpen] = useState(false)
  const [touchDevice, setTouchDevice] = useState(false)
  const [touchFocused, setTouchFocused] = useState(false)
  const [keyboardOffset, setKeyboardOffset] = useState(0)
  const [imageActions, setImageActions] = useState(null)

  callbacksRef.current = { onChange, onWordCountChange, onOpenMediaSettings, onUploadFiles, onEditorBlur }
  imageActionsRef.current = imageActions

  const syncEmptyState = (editor) => {
    if (!editor) return
    if (isComposingRef.current) return
    const text = editor.textContent?.replace(/\u00a0/g, ' ').trim() || ''
    const hasMedia = Boolean(editor.querySelector('img, video, figure, hr'))
    editor.classList.toggle('is-empty', !text && !hasMedia)
    callbacksRef.current.onWordCountChange?.(
      text ? text.split(/\s+/).filter(Boolean).length : 0
    )
  }

  const notifyChange = (editor) => {
    if (isComposingRef.current) return
    syncEmptyState(editor)
    callbacksRef.current.onChange?.(editor.innerHTML, editor.textContent || '')
  }

  const restoreSelection = () => {
    const editor = editorRef.current
    const range = savedRangeRef.current
    if (!editor || !range || !editor.contains(range.startContainer)) return false
    editor.focus()
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    return true
  }

  const updateToolbar = useCallback(() => {
    const editor = editorRef.current
    const toolbarHasFocus = toolbarRef.current?.contains(document.activeElement)
      || touchToolbarRef.current?.contains(document.activeElement)
    if (toolbarHasFocus) return
    const selection = window.getSelection()
    if (!editor || !selection?.rangeCount || !isInsideEditor(editor, selection.anchorNode)) {
      setToolbar((current) => ({ ...current, visible: false }))
      setPlusButton({ visible: false, left: 0, top: 0 })
      return
    }

    const range = selection.getRangeAt(0)
    savedRangeRef.current = range.cloneRange()
    const block = currentBlock(editor, selection.anchorNode)
    const collapsed = selection.isCollapsed
    if (touchDevice && touchFocused) {
      const caretBlock = block || editor
      const caretBounds = caretBlock.getBoundingClientRect()
      const viewportBottom = window.visualViewport?.height || window.innerHeight
      const barHeight = touchToolbarRef.current?.offsetHeight || 52
      if (caretBounds.bottom - (window.visualViewport?.offsetTop || 0) > viewportBottom - barHeight - 12) {
        window.requestAnimationFrame(() => caretBlock.scrollIntoView({ block: 'center', behavior: 'auto' }))
      }
    }

    if (collapsed) {
      setToolbar((current) => ({ ...current, visible: false }))
      const emptyBlock = block
        ? !block.textContent?.replace(/\u00a0/g, ' ').trim() && !block.querySelector('img, video, figure, hr')
        : !editor.textContent?.replace(/\u00a0/g, ' ').trim() && !editor.querySelector('img, video, figure, hr')
      if (emptyBlock) {
        const bounds = (block || editor).getBoundingClientRect()
        const editorBounds = editor.getBoundingClientRect()
        setPlusButton({
          visible: true,
          left: Math.max(8, editorBounds.left - 46),
          top: Math.max(8, bounds.top + Math.min(bounds.height, 30) / 2 - 16),
        })
      } else {
        setPlusButton({ visible: false, left: 0, top: 0 })
      }
      return
    }

    setPlusButton({ visible: false, left: 0, top: 0 })
    const selectionBounds = range.getBoundingClientRect()
    selectionRectRef.current = selectionBounds
    const toolbarWidth = toolbarRef.current?.offsetWidth || 460
    const toolbarHeight = toolbarRef.current?.offsetHeight || 44
    const left = Math.min(
      Math.max(8, selectionBounds.left + selectionBounds.width / 2 - toolbarWidth / 2),
      Math.max(8, window.innerWidth - toolbarWidth - 8)
    )
    const top = Math.max(8, selectionBounds.top - toolbarHeight - 10)
    let activeElement = selection.anchorNode?.nodeType === Node.ELEMENT_NODE
      ? selection.anchorNode
      : selection.anchorNode?.parentElement
    const active = {}
    try {
      active.bold = document.queryCommandState('bold')
      active.italic = document.queryCommandState('italic')
      active.underline = document.queryCommandState('underline')
      active.ul = document.queryCommandState('insertUnorderedList')
      active.ol = document.queryCommandState('insertOrderedList')
    } catch {
      active.bold = false
      active.italic = false
      active.underline = false
    }
    active.h1 = Boolean(activeElement?.closest('h1'))
    active.h2 = Boolean(activeElement?.closest('h2'))
    active.blockquote = Boolean(activeElement?.closest('blockquote'))
    active.p = Boolean(activeElement?.closest('p'))
    active.link = Boolean(activeElement?.closest('a'))
    setToolbar({ visible: !touchDevice, left, top, active })
  }, [touchDevice, touchFocused])

  useLayoutEffect(() => {
    const toolbarElement = toolbarRef.current
    const selectionBounds = selectionRectRef.current
    if (!toolbar.visible || touchDevice || !toolbarElement || !selectionBounds) return
    const bounds = toolbarElement.getBoundingClientRect()
    const left = Math.max(8, Math.min(
      selectionBounds.left + selectionBounds.width / 2 - bounds.width / 2,
      window.innerWidth - bounds.width - 8
    ))
    const top = Math.max(8, selectionBounds.top - bounds.height - 10)
    if (left !== toolbar.left || top !== toolbar.top) {
      setToolbar((current) => ({ ...current, left, top }))
    }
  }, [toolbar.visible, toolbar.left, toolbar.top, touchDevice])

  const hideFloatingControls = () => {
    setToolbar((current) => ({ ...current, visible: false }))
    setPlusButton({ visible: false, left: 0, top: 0 })
    setInsertMenuOpen(false)
    setImageMenuOpen(false)
  }

  const runCommand = (command, value) => {
    const editor = editorRef.current
    if (!editor) return
    if (!restoreSelection()) editor.focus()
    document.execCommand(command, false, value)
    notifyChange(editor)
    updateToolbar()
  }

  const insertBlock = (html) => {
    const editor = editorRef.current
    if (!editor) return
    if (!restoreSelection()) {
      editor.focus()
      const endRange = document.createRange()
      endRange.selectNodeContents(editor)
      endRange.collapse(false)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(endRange)
      savedRangeRef.current = endRange.cloneRange()
    }
    const marker = `rich-text-caret-${Date.now()}-${Math.random().toString(36).slice(2)}`
    document.execCommand('insertHTML', false, `${html}<p data-caret-marker="${marker}"><br></p>`)
    const paragraph = editor.querySelector(`[data-caret-marker="${marker}"]`)
    paragraph?.removeAttribute('data-caret-marker')
    if (paragraph) {
      const caret = document.createRange()
      caret.selectNodeContents(paragraph)
      caret.collapse(true)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(caret)
      savedRangeRef.current = caret.cloneRange()
    }
    editor.focus()
    notifyChange(editor)
    hideFloatingControls()
  }

  const insertImage = (image) => {
    const url = safeMediaUrl(image?.url)
    if (!url) return
    const caption = image.name ? `<figcaption>${escapeHtml(image.name)}</figcaption>` : ''
    insertBlock(`<figure><img src="${escapeHtml(url)}" alt="${escapeHtml(image.name || 'Article image')}">${caption}</figure>`)
  }

  const insertVideo = () => {
    const url = window.prompt('Enter a video URL')
    if (!url) return
    const safeUrl = safeMediaUrl(url)
    if (!safeUrl) {
      window.alert('Enter a complete video URL beginning with https:// or http://.')
      return
    }
    insertBlock(`<figure><a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">Watch video</a></figure>`)
  }

  const insertQuote = () => {
    insertBlock('<blockquote><p><br></p></blockquote>')
  }

  const insertList = () => {
    insertBlock('<ul><li><br></li></ul>')
  }

  const insertDivider = () => insertBlock('<hr>')

  const insertLink = () => {
    const selection = window.getSelection()
    let activeElement = selection?.anchorNode?.nodeType === Node.ELEMENT_NODE
      ? selection.anchorNode
      : selection?.anchorNode?.parentElement
    let selectedLink = activeElement?.closest('a')
    if (selection?.rangeCount && isInsideEditor(editorRef.current, selection.anchorNode)) {
      savedRangeRef.current = selection.getRangeAt(0).cloneRange()
    }
    setLinkError('')
    setLinkUrl(selectedLink?.href || '')
    setLinkEditorOpen(true)
    window.requestAnimationFrame(() => linkInputRef.current?.focus())
  }

  const applyLink = (event) => {
    event.preventDefault()
    let url
    try {
      url = new URL(linkUrl.trim())
    } catch {
      setLinkError('Enter a complete http, https, or mailto URL.')
      return
    }
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) {
      setLinkError('Only web and email links are supported.')
      return
    }
    restoreSelection()
    document.execCommand('createLink', false, url.href)
    const editor = editorRef.current
    if (editor) {
      editor.querySelectorAll('a').forEach((anchor) => {
        if (anchor.href === url.href) {
          anchor.target = '_blank'
          anchor.rel = 'noopener noreferrer'
        }
      })
      notifyChange(editor)
    }
    setLinkEditorOpen(false)
    updateToolbar()
  }

  const unlink = () => {
    restoreSelection()
    document.execCommand('unlink', false)
    if (editorRef.current) notifyChange(editorRef.current)
    setLinkEditorOpen(false)
    updateToolbar()
  }

  const handleMarkdownShortcut = (event) => {
    if (event.isComposing || isComposingRef.current || event.inputType !== 'insertText' || event.data !== ' ') return
    const selection = window.getSelection()
    if (!selection?.rangeCount || !selection.isCollapsed || !isInsideEditor(editorRef.current, selection.anchorNode)) return
    const range = selection.getRangeAt(0)
    const block = currentBlock(editorRef.current, range.startContainer)
    if (!block) return
    const beforeCaret = range.cloneRange()
    beforeCaret.selectNodeContents(block)
    beforeCaret.setEnd(range.startContainer, range.startOffset)
    const shortcut = beforeCaret.toString()
    const formats = {
      '#': ['formatBlock', 'h1'],
      '##': ['formatBlock', 'h2'],
      '>': ['formatBlock', 'blockquote'],
      '-': ['insertUnorderedList', undefined],
    }
    const format = formats[shortcut]
    if (!format) return
    event.preventDefault()
    beforeCaret.deleteContents()
    document.execCommand(format[0], false, format[1])
    if (editorRef.current) notifyChange(editorRef.current)
    updateToolbar()
  }

  const handleEditorInput = (event) => {
    if (isComposingRef.current || event.nativeEvent.isComposing) return
    notifyChange(event.currentTarget)
    updateToolbar()
  }

  const handleImageDrop = async (files) => {
    const imageFiles = Array.from(files || []).filter((file) => file.type.startsWith('image/'))
    if (!imageFiles.length) return
    const uploaded = await callbacksRef.current.onUploadFiles?.(imageFiles)
    const firstImage = uploaded?.find((item) => item.type === 'image')
    if (firstImage) insertImage(firstImage)
  }

  const openImageActions = (image) => {
    if (!touchDevice) return
    saveCurrentRange()
    setImageActions(image)
  }

  const saveCurrentRange = () => {
    const selection = window.getSelection()
    if (selection?.rangeCount && isInsideEditor(editorRef.current, selection.anchorNode)) {
      savedRangeRef.current = selection.getRangeAt(0).cloneRange()
    }
  }

  const removeSelectedImage = () => {
    const image = imageActionsRef.current
    const figure = image?.closest('figure')
    ;(figure || image)?.remove()
    if (editorRef.current) notifyChange(editorRef.current)
    setImageActions(null)
  }

  const addImageCaption = () => {
    const image = imageActionsRef.current
    if (!image) return
    const figure = image.closest('figure') || image.parentElement
    if (!figure) return
    const currentCaption = figure.querySelector('figcaption')?.textContent || ''
    const caption = window.prompt('Image caption', currentCaption)
    if (caption === null) return
    let captionElement = figure.querySelector('figcaption')
    if (!captionElement) {
      captionElement = document.createElement('figcaption')
      figure.append(captionElement)
    }
    captionElement.textContent = caption
    notifyChange(editorRef.current)
    setImageActions(null)
  }

  const replaceSelectedImage = () => {
    imageReplaceTargetRef.current = imageActionsRef.current
    setImageActions(null)
    callbacksRef.current.onOpenMediaSettings?.()
  }

  const replaceImage = (image) => {
    const target = imageReplaceTargetRef.current
    const url = safeMediaUrl(image?.url)
    if (!target || !url) return false
    target.src = url
    target.alt = image.name || 'Article image'
    notifyChange(editorRef.current)
    imageReplaceTargetRef.current = null
    return true
  }

  useImperativeHandle(ref, () => ({
    runCommand,
    insertLink,
    insertImage,
    replaceImage,
    hasPendingImageReplacement: () => Boolean(imageReplaceTargetRef.current),
  }))

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    editor.innerHTML = initialValueRef.current || ''
    editor.classList.add('rich-text-editor')
    document.execCommand('defaultParagraphSeparator', false, 'p')
    syncEmptyState(editor)
  }, [])

  useEffect(() => {
    if (appliedContentRevisionRef.current === contentRevision) return
    appliedContentRevisionRef.current = contentRevision
    const editor = editorRef.current
    if (!editor) return
    editor.innerHTML = initialValue || ''
    syncEmptyState(editor)
  }, [contentRevision, initialValue])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(pointer: coarse), (max-width: 767px)')
    const updateTouchDevice = () => setTouchDevice(mediaQuery.matches)
    updateTouchDevice()
    mediaQuery.addEventListener?.('change', updateTouchDevice)
    document.addEventListener('selectionchange', updateToolbar)
    const hideOnScroll = () => hideFloatingControls()
    window.addEventListener('scroll', hideOnScroll, true)
    window.addEventListener('resize', updateToolbar)
    return () => {
      mediaQuery.removeEventListener?.('change', updateTouchDevice)
      document.removeEventListener('selectionchange', updateToolbar)
      window.removeEventListener('scroll', hideOnScroll, true)
      window.removeEventListener('resize', updateToolbar)
    }
  }, [touchDevice, updateToolbar])

  useEffect(() => {
    const viewport = window.visualViewport
    if (!touchDevice || !viewport) {
      setKeyboardOffset(0)
      return undefined
    }
    const updateKeyboardOffset = () => {
      setKeyboardOffset(Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop))
    }
    updateKeyboardOffset()
    viewport.addEventListener('resize', updateKeyboardOffset)
    viewport.addEventListener('scroll', updateKeyboardOffset)
    return () => {
      viewport.removeEventListener('resize', updateKeyboardOffset)
      viewport.removeEventListener('scroll', updateKeyboardOffset)
    }
  }, [touchDevice])

  useEffect(() => {
    const root = document.documentElement
    const previousValue = root.style.getPropertyValue('--content-studio-mobile-obstruction')
    root.style.setProperty('--content-studio-mobile-obstruction', `${keyboardOffset + (touchFocused ? 58 : 0)}px`)
    return () => {
      if (previousValue) root.style.setProperty('--content-studio-mobile-obstruction', previousValue)
      else root.style.removeProperty('--content-studio-mobile-obstruction')
    }
  }, [keyboardOffset, touchFocused])

  useEffect(() => {
    if (!touchDevice || !(insertMenuOpen || linkEditorOpen || imageActions)) return undefined
    const previousBodyOverflow = document.body.style.overflow
    const previousDocumentOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousDocumentOverflow
    }
  }, [imageActions, insertMenuOpen, linkEditorOpen, touchDevice])

  const toolbarContent = (
    <>
      {toolbarItems.map(({ label, icon: Icon, command, value, state }) => (
        <button
          key={label}
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={state ? Boolean(toolbar.active[state]) : undefined}
          onPointerDown={(event) => event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => runCommand(command, value)}
          className={`rich-text-toolbar-button ${state && toolbar.active[state] ? 'is-active' : ''}`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </button>
      ))}
      <button
        type="button"
        title="Add link"
        aria-label="Add link"
        onPointerDown={(event) => event.preventDefault()}
        onMouseDown={(event) => event.preventDefault()}
        onClick={insertLink}
        className={`rich-text-toolbar-button ${toolbar.active.link ? 'is-active' : ''}`}
      >
        <Link2 className="h-4 w-4" aria-hidden="true" />
      </button>
      {toolbar.active.link && (
        <button type="button" title="Remove link" aria-label="Remove link" onMouseDown={(event) => event.preventDefault()} onClick={unlink} className="rich-text-toolbar-unlink">
          Unlink
        </button>
      )}
    </>
  )

  const mobileToolbarContent = (
    <>
      <button type="button" aria-label="Insert content" title="Insert content" aria-expanded={insertMenuOpen} onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()} onClick={() => { saveCurrentRange(); setInsertMenuOpen((open) => !open); setLinkEditorOpen(false) }} className={`rich-text-toolbar-button ${insertMenuOpen ? 'is-active' : ''}`}><Plus className="h-5 w-5" aria-hidden="true" /></button>
      {toolbarItems.filter(({ state }) => ['bold', 'italic', 'underline', 'h1', 'h2', 'blockquote', 'ul', 'ol'].includes(state)).map(({ label, icon: Icon, command, value, state }) => (
        <button key={label} type="button" title={label} aria-label={label} aria-pressed={Boolean(toolbar.active[state])} onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand(command, value)} className={`rich-text-toolbar-button ${toolbar.active[state] ? 'is-active' : ''}`}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </button>
      ))}
      <button type="button" title="Link" aria-label="Link" onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()} onClick={() => { saveCurrentRange(); insertLink(); setInsertMenuOpen(false) }} className={`rich-text-toolbar-button ${toolbar.active.link ? 'is-active' : ''}`}><Link2 className="h-4 w-4" aria-hidden="true" /></button>
      <button type="button" title="Image" aria-label="Image" onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()} onClick={() => { saveCurrentRange(); setInsertMenuOpen(true); setImageMenuOpen(true) }} className="rich-text-toolbar-button"><ImagePlus className="h-4 w-4" aria-hidden="true" /></button>
      <button type="button" title="Done editing" aria-label="Done editing" onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()} onClick={() => editorRef.current?.blur()} className="rich-text-toolbar-done">Done</button>
    </>
  )

  const renderToolbar = (className, style, content = toolbarContent) => (
    <div
      ref={className === 'rich-text-bubble-toolbar' ? toolbarRef : touchToolbarRef}
      className={className}
      style={style}
      role="toolbar"
      aria-label="Article formatting"
      onMouseDown={(event) => {
        if (event.target.closest('button')) event.preventDefault()
      }}
      onPointerDown={(event) => {
        if (event.target.closest('button')) event.preventDefault()
      }}
    >
      {content}
      {linkEditorOpen && !touchDevice && (
        <form className="rich-text-link-form" onSubmit={applyLink}>
          <input
            ref={linkInputRef}
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            onMouseDown={(event) => event.stopPropagation()}
            aria-label="Link URL"
            placeholder="https://example.com"
            type="url"
          />
          <button type="submit" onMouseDown={(event) => event.preventDefault()}>Apply</button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setLinkEditorOpen(false)}>Cancel</button>
          {linkError && <span role="alert">{linkError}</span>}
        </form>
      )}
    </div>
  )

  return (
    <div className="rich-text-editor-shell">
      {toolbar.visible && !touchDevice && (
        <div className="rich-text-bubble-toolbar-wrap" style={{ left: toolbar.left, top: toolbar.top }}>
          {renderToolbar('rich-text-bubble-toolbar')}
        </div>
      )}
      {touchDevice && touchFocused && renderToolbar('rich-text-touch-toolbar', {
        bottom: `${keyboardOffset}px`,
      }, mobileToolbarContent)}
      {touchDevice && touchFocused && insertMenuOpen && (
        <div className="rich-text-mobile-sheet-backdrop" style={{ bottom: `calc(56px + ${keyboardOffset}px)` }} onMouseDown={(event) => { if (event.target === event.currentTarget) { setInsertMenuOpen(false); setImageMenuOpen(false) } }}>
          <div className="rich-text-mobile-sheet" role="dialog" aria-label="Insert into story">
            <div className="rich-text-sheet-handle" />
            <div className="rich-text-mobile-sheet-options">
              {imageMenuOpen ? (
                images.length ? images.map((image, index) => (
                  <button key={`${image.url}-${index}`} type="button" onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()} onClick={() => insertImage(image)}>
                    <img src={image.url} alt="" /><span>{image.name || `Image ${index + 1}`}</span>
                  </button>
                )) : (
                  <button type="button" onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()} onClick={() => { setInsertMenuOpen(false); callbacksRef.current.onOpenMediaSettings?.() }}>
                    <ImagePlus className="h-4 w-4" aria-hidden="true" />Open media settings
                  </button>
                )
              ) : (
                <>
                  <button type="button" onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()} onClick={() => { setImageMenuOpen(true); setInsertMenuOpen(true) }}><ImagePlus className="h-4 w-4" aria-hidden="true" />Image</button>
                  <button type="button" onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()} onClick={insertVideo}><Video className="h-4 w-4" aria-hidden="true" />Video</button>
                  <button type="button" onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()} onClick={insertQuote}><Quote className="h-4 w-4" aria-hidden="true" />Quote</button>
                  <button type="button" onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()} onClick={insertList}><List className="h-4 w-4" aria-hidden="true" />List</button>
                  <button type="button" onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()} onClick={insertDivider}><Minus className="h-4 w-4" aria-hidden="true" />Divider</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {touchDevice && linkEditorOpen && (
        <div className="rich-text-mobile-sheet-backdrop rich-text-link-sheet-backdrop" style={{ bottom: `${keyboardOffset}px` }} onMouseDown={(event) => { if (event.target === event.currentTarget) { setLinkEditorOpen(false); editorRef.current?.focus() } }}>
          <form className="rich-text-mobile-sheet rich-text-mobile-link-sheet" role="dialog" aria-label="Edit link" onSubmit={applyLink}>
            <div className="rich-text-sheet-handle" />
            <label htmlFor="rich-text-mobile-link-url">Link URL</label>
            <input id="rich-text-mobile-link-url" ref={linkInputRef} value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" placeholder="https://example.com" />
            {linkError && <p role="alert">{linkError}</p>}
            <div className="rich-text-mobile-sheet-actions">
              <button type="submit">Apply</button>
              {toolbar.active.link && <button type="button" onClick={unlink}>Remove</button>}
              <button type="button" onClick={() => { setLinkEditorOpen(false); editorRef.current?.focus() }}>Cancel</button>
            </div>
          </form>
        </div>
      )}
      {touchDevice && imageActions && (
        <div className="rich-text-mobile-sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setImageActions(null) }}>
          <div className="rich-text-mobile-sheet" role="dialog" aria-label="Image options">
            <div className="rich-text-sheet-handle" />
            <div className="rich-text-mobile-sheet-actions">
              <button type="button" onClick={replaceSelectedImage}>Replace</button>
              <button type="button" onClick={addImageCaption}>Caption</button>
              <button type="button" onClick={removeSelectedImage}>Remove</button>
              <button type="button" onClick={() => setImageActions(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {plusButton.visible && (
        <div className="rich-text-insert-wrap" style={{ left: plusButton.left, top: plusButton.top }}>
          <button
            type="button"
            className="rich-text-insert-trigger"
            aria-label="Insert content"
            aria-expanded={insertMenuOpen}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setInsertMenuOpen((open) => !open)
              setImageMenuOpen(false)
            }}
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
          </button>
          {insertMenuOpen && (
            <div className="rich-text-insert-menu">
              {imageMenuOpen ? (
                images.length ? images.map((image, index) => (
                  <button key={`${image.url}-${index}`} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertImage(image)}>
                    <img src={image.url} alt="" />
                    <span>{image.name || `Image ${index + 1}`}</span>
                  </button>
                )) : (
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => callbacksRef.current.onOpenMediaSettings?.()}>
                    <ImagePlus className="h-4 w-4" aria-hidden="true" />Open media settings
                  </button>
                )
              ) : (
                <>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setImageMenuOpen(true); setInsertMenuOpen(true) }}><ImagePlus className="h-4 w-4" aria-hidden="true" />Image</button>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={insertVideo}><Video className="h-4 w-4" aria-hidden="true" />Video link</button>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={insertQuote}><Quote className="h-4 w-4" aria-hidden="true" />Quote</button>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={insertList}><List className="h-4 w-4" aria-hidden="true" />List</button>
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={insertDivider}><Minus className="h-4 w-4" aria-hidden="true" />Divider</button>
                </>
              )}
            </div>
          )}
        </div>
      )}
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-label="Article body"
        aria-multiline="true"
        data-placeholder="Tell your story..."
        spellCheck
        autoCapitalize="sentences"
        autoCorrect="on"
        suppressContentEditableWarning
        onBeforeInput={handleMarkdownShortcut}
        onInput={handleEditorInput}
        onCompositionStart={() => { isComposingRef.current = true }}
        onCompositionEnd={(event) => {
          isComposingRef.current = false
          notifyChange(event.currentTarget)
          updateToolbar()
        }}
        onPaste={(event) => {
          const pastedImages = Array.from(event.clipboardData?.items || [])
            .filter((item) => item.type.startsWith('image/'))
            .map((item) => item.getAsFile())
            .filter(Boolean)
          if (pastedImages.length) {
            event.preventDefault()
            void handleImageDrop(pastedImages)
            return
          }
          event.preventDefault()
          document.execCommand('insertText', false, event.clipboardData?.getData('text/plain') || '')
          notifyChange(event.currentTarget)
        }}
        onDrop={(event) => {
          const files = event.dataTransfer?.files
          if (!files?.length) return
          event.preventDefault()
          void handleImageDrop(files)
        }}
        onClick={(event) => {
          if (event.target instanceof HTMLImageElement && editorRef.current?.contains(event.target)) openImageActions(event.target)
        }}
        onFocus={() => setTouchFocused(true)}
        onBlur={(event) => {
          if (toolbarRef.current?.contains(event.relatedTarget) || touchToolbarRef.current?.contains(event.relatedTarget)) return
          callbacksRef.current.onEditorBlur?.()
          if (event.relatedTarget?.closest?.('.rich-text-mobile-sheet')) return
          setTouchFocused(false)
          if (!event.relatedTarget?.closest?.('.rich-text-touch-toolbar')) hideFloatingControls()
        }}
        className="rich-text-editor min-h-[420px] text-[20px] leading-[1.7] text-slate-800 outline-none"
      />
    </div>
  )
})

export default RichTextEditor
