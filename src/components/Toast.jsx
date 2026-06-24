import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';

void motion;

const Toast = ({ message, type = 'info', action, onAction, onClose, duration = 5000 }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, duration);
        return () => clearTimeout(timer);
    }, [onClose, duration]);

    const icons = {
        success: <CheckCircle className="toast-icon text-success" />,
        error: <AlertCircle className="toast-icon text-error" />,
        info: <Info className="toast-icon text-info" />
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            className={`toast-container ${type}`}
            role="alert"
            aria-live="polite"
        >
            <div className="toast-content">
                {icons[type]}
                <span className="toast-message">{message}</span>
                {action && (
                    <button className="toast-action" onClick={() => { onAction?.(); onClose(); }}>
                        {action}
                    </button>
                )}
            </div>
            <button className="toast-close" onClick={onClose}>
                <X size={16} />
            </button>
            <div className="toast-progress-bar">
                <motion.div
                    initial={{ width: '100%' }}
                    animate={{ width: '0%' }}
                    transition={{ duration: duration / 1000, ease: 'linear' }}
                    className="toast-progress-fill"
                />
            </div>
        </motion.div>
    );
};

export const ToastContainer = ({ toasts, removeToast }) => {
    return (
        <div className="toasts-wrapper" aria-live="polite">
            <AnimatePresence>
                {toasts.map((toast) => (
                    <Toast
                        key={toast.id}
                        message={toast.message}
                        type={toast.type}
                        action={toast.action}
                        onAction={toast.onAction}
                        onClose={() => removeToast(toast.id)}
                    />
                ))}
            </AnimatePresence>
        </div>
    );
};
