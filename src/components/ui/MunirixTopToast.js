'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

/**
 * Toast / Diálogo de confirmación propio de Munirix centrado en la parte superior.
 * Reemplaza los diálogos nativos del navegador (window.confirm / window.prompt / alert).
 */
export default function MunirixTopToast({
  toast = null,
  onCloseToast,
  confirmDialog = null,
  onCancelConfirm,
}) {
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    if (confirmDialog?.withInput) {
      setInputValue(confirmDialog.defaultValue || '');
    } else {
      setInputValue('');
    }
  }, [confirmDialog]);

  useEffect(() => {
    if (!toast || !onCloseToast) return;
    const timer = setTimeout(() => {
      onCloseToast();
    }, toast.duration || 4200);
    return () => clearTimeout(timer);
  }, [toast, onCloseToast]);

  if (!toast && !confirmDialog) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: '1.15rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.65rem',
        width: 'min(92vw, 480px)',
        pointerEvents: 'none',
      }}
    >
      {confirmDialog && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            pointerEvents: 'auto',
            width: '100%',
            padding: '1.05rem 1.15rem',
            borderRadius: '16px',
            background: 'rgba(13, 17, 26, 0.96)',
            border:
              confirmDialog.tone === 'danger'
                ? '1px solid rgba(244, 63, 94, 0.45)'
                : '1px solid rgba(56, 198, 236, 0.4)',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
            <AlertTriangle
              size={18}
              color={confirmDialog.tone === 'danger' ? '#fb7185' : '#38c6ec'}
              style={{ flexShrink: 0, marginTop: '0.15rem' }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f2f6fc' }}>
                {confirmDialog.title || 'Confirmación de Munirix'}
              </div>
              <p style={{ fontSize: '0.82rem', color: '#9ab0c9', marginTop: '0.2rem', lineHeight: 1.45 }}>
                {confirmDialog.message}
              </p>
            </div>
          </div>

          {confirmDialog.withInput && (
            <input
              type="text"
              className="hc-input"
              placeholder={confirmDialog.placeholder || 'Escribe aquí...'}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              autoFocus
            />
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={onCancelConfirm}
              style={{
                padding: '0.45rem 0.9rem',
                borderRadius: '9px',
                border: '1px solid rgba(154, 176, 201, 0.22)',
                background: 'transparent',
                color: '#cbd5e1',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => confirmDialog.onConfirm(inputValue)}
              style={{
                padding: '0.45rem 0.95rem',
                borderRadius: '9px',
                border: 'none',
                background: confirmDialog.tone === 'danger' ? '#e11d48' : '#38c6ec',
                color: confirmDialog.tone === 'danger' ? '#fff' : '#07090e',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {confirmDialog.confirmLabel || 'Confirmar'}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          style={{
            pointerEvents: 'auto',
            width: '100%',
            padding: '0.82rem 1rem',
            borderRadius: '14px',
            background: 'rgba(13, 17, 26, 0.96)',
            border:
              toast.type === 'error'
                ? '1px solid rgba(244, 63, 94, 0.45)'
                : toast.type === 'info'
                ? '1px solid rgba(56, 198, 236, 0.4)'
                : '1px solid rgba(16, 185, 129, 0.45)',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.45)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            fontSize: '0.84rem',
            color: '#f2f6fc',
          }}
        >
          {toast.type === 'error' ? (
            <XCircle size={17} color="#fb7185" style={{ flexShrink: 0 }} />
          ) : toast.type === 'info' ? (
            <Info size={17} color="#38c6ec" style={{ flexShrink: 0 }} />
          ) : (
            <CheckCircle2 size={17} color="#34d399" style={{ flexShrink: 0 }} />
          )}
          <span style={{ flex: 1 }}>{toast.message}</span>
          {onCloseToast && (
            <button
              type="button"
              onClick={onCloseToast}
              aria-label="Cerrar aviso"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                display: 'inline-flex',
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
