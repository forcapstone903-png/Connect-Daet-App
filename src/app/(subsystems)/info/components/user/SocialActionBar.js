'use client'

import { Bookmark, MessageCircle } from 'lucide-react'
import Reactions from './Reactions'
import ShareRepost from './ShareRepost'
import PostActionMenu from './PostActionMenu'

export default function SocialActionBar({ contentType, contentId, userId, commentCount = 0, onToggleComments, isSaved = false, onToggleSave, onRepost, originalPost = null, repostContentType, repostContentId, heartOnly = false, compactFeed = false, postOptions = null, postActionMenuProps = {}, shareUrl, showOverflowMenu = true }) {
  const copyContentLink = async () => {
    try {
      const url = new URL(shareUrl || window.location.href, window.location.origin).toString()
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        const input = document.createElement('textarea')
        input.value = url
        input.style.position = 'fixed'
        input.style.opacity = '0'
        document.body.appendChild(input)
        input.select()
        const copied = document.execCommand('copy')
        input.remove()
        if (!copied) throw new Error('Clipboard access is unavailable.')
      }
      window.alert('Link copied to clipboard.')
    } catch (error) {
      console.error('Content link copy failed:', error)
      window.alert('Unable to copy the content link.')
    }
  }

  return (
    <div className={compactFeed
      ? 'tourism-action-row medium-home-action-row mt-0 flex min-w-0 items-center gap-4 pt-0'
      : `tourism-action-row mt-3 grid min-w-0 items-end gap-1.5 pt-3 sm:gap-2 ${showOverflowMenu ? 'grid-cols-5' : 'grid-cols-4'}`}>
      <div className={`flex min-w-0 items-center ${compactFeed ? '' : 'order-3 justify-center'}`}>
        <Reactions contentType={contentType} contentId={contentId} userId={userId} compact fullWidth={!compactFeed} breakdown heartOnly={heartOnly} compactFeed={compactFeed} />
      </div>

      <button
        type="button"
        onClick={onToggleComments}
        className={`tourism-action usr-press usr-lift inline-flex h-9 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold ${compactFeed ? 'medium-home-action' : 'order-2 w-full'}`}
        title="Comments"
        aria-label={`Comments, ${commentCount}`}
      >
        <MessageCircle className={compactFeed ? 'h-4 w-4' : 'h-3.5 w-3.5'} aria-hidden="true" />
        <span key={commentCount} className="usr-count-pop font-bold">{commentCount}</span>
      </button>

      <div className={`flex h-9 min-w-0 items-center justify-center ${compactFeed ? 'medium-home-action' : 'order-1 w-full'}`}>
        {/* Reactions/comments may key on the repost instance, so the repost
            action takes its own explicit target when one is supplied. */}
        <ShareRepost contentType={repostContentType ?? contentType} contentId={repostContentId ?? contentId} userId={userId} onRepost={onRepost} originalPost={originalPost} fullWidth compactFeed={compactFeed} />
      </div>

      {compactFeed ? (
        <>
          <button
            type="button"
            onClick={onToggleSave}
            className={`tourism-action medium-home-save usr-press inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs ${isSaved ? 'text-emerald-500' : 'text-slate-500'}`}
            title={isSaved ? 'Remove from saved items' : 'Save post'}
            aria-label={isSaved ? 'Remove from saved items' : 'Save post'}
            aria-pressed={isSaved}
          >
            <Bookmark className={`h-[18px] w-[18px] ${isSaved ? 'fill-current' : ''}`} aria-hidden="true" />
          </button>
          {showOverflowMenu && (postOptions || (
            <PostActionMenu
              {...postActionMenuProps}
              contentType={contentType}
              contentId={contentId}
              userId={userId}
              contentTitle={originalPost?.title}
              shareUrl={shareUrl}
              onCopyLink={postActionMenuProps.onCopyLink || copyContentLink}
            />
          ))}
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={onToggleSave}
            className={`tourism-action usr-press usr-lift inline-flex h-9 min-w-0 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-1.5 text-xs font-semibold ${
              isSaved ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50'
            }`}
            title={isSaved ? 'Remove from saved items' : 'Save post'}
            aria-label={isSaved ? 'Remove from saved items' : 'Save post'}
            aria-pressed={isSaved}
          >
            <Bookmark key={isSaved ? 'saved' : 'unsaved'} className={`usr-emoji-pop h-3.5 w-3.5 ${isSaved ? 'fill-current' : ''}`} aria-hidden="true" />
            <span className="hidden sm:inline">{isSaved ? 'Saved' : 'Save'}</span>
          </button>
          {showOverflowMenu && <div className="flex items-center justify-center">
            {postOptions || (
              <PostActionMenu
                contentType={contentType}
                contentId={contentId}
                userId={userId}
                contentTitle={originalPost?.title}
                shareUrl={shareUrl}
                onCopyLink={copyContentLink}
              />
            )}
          </div>}
        </>
      )}
    </div>
  )
}