import { Component } from 'react';

/**
 * A crash anywhere below this point renders a message instead of a white screen.
 * A blank page tells you nothing; this tells you the page, the error, and where to look.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Page crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{ padding: 32, maxWidth: 640 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>Something broke</div>
        <h1 style={{ marginBottom: 12 }}>This page could not be drawn</h1>

        <div className="error" style={{ marginBottom: 18 }}>
          {this.state.error?.message || String(this.state.error)}
        </div>

        <p className="sub">
          This is a bug, not something you did. Send the message above — and anything red in the browser console
          (press F12) — and it can be fixed.
        </p>

        <div className="row" style={{ marginTop: 16 }}>
          <button onClick={() => this.setState({ error: null })}>Try again</button>
          <button className="ghost" onClick={() => (window.location.href = '/pipeline')}>
            Back to the pipeline
          </button>
        </div>
      </div>
    );
  }
}
