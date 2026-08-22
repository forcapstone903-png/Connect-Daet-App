'use client'

export default function ConfirmationModal({ isOpen, title, message, onConfirm, onCancel, confirmText = 'Confirm', cancelText = 'Cancel', isDangerous = false }) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />
      
      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          <p className="text-sm text-slate-600">{message}</p>
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-slate-200 px-6 py-4">
          <button
            onClick={onCancel}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-all ${
              isDangerous
                ? 'bg-red-600 hover:bg-red-700 shadow-lg shadow-red-500/20'
                : 'bg-sky-600 hover:bg-sky-700 shadow-lg shadow-sky-500/20'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
