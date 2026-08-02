import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      const isChunkError = /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(
        this.state.error?.message || ''
      );

      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', padding: '2rem', textAlign: 'center', background: '#0a0a0a', color: '#e5e5e5',
        }}>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
            {isChunkError ? 'New Version Available' : 'Something went wrong'}
          </h1>
          <p style={{ color: '#999', marginBottom: '1.5rem', maxWidth: '440px', lineHeight: '1.5' }}>
            {isChunkError
              ? 'Audire was updated while your app was open. Click below to load the latest version.'
              : (this.state.error?.message || 'An unexpected error occurred.')}
          </p>
          <button
            onClick={() => {
              if (isChunkError) {
                sessionStorage.removeItem('chunk_reload_attempted');
                window.location.reload();
              } else {
                this.setState({ hasError: false, error: null });
              }
            }}
            style={{
              padding: '0.6rem 1.5rem', borderRadius: '8px', border: 'none',
              background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: '1rem', fontWeight: 500
            }}
          >
            {isChunkError ? 'Refresh Audire' : 'Back to Audire'}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
