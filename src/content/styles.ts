export const BUTTON_STYLES = `
  :host {
    all: initial;
    display: inline-block;
    position: relative;
    z-index: 2147483647;
  }

  .captcha-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fff;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    vertical-align: middle;
    margin-left: 4px;
    transition: all 0.2s ease;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  .captcha-btn:hover {
    background: #f0f0f0;
    border-color: #999;
  }

  .captcha-btn.loading {
    pointer-events: none;
    opacity: 0.7;
  }

  .captcha-btn.success {
    background: #d4edda;
    border-color: #28a745;
    animation: flash-green 0.6s ease;
  }

  .captcha-btn.error {
    background: #f8d7da;
    border-color: #dc3545;
    animation: flash-red 0.6s ease;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid #ccc;
    border-top-color: #333;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @keyframes flash-green {
    0%, 100% { background: #d4edda; }
    50% { background: #a3d9a5; }
  }

  @keyframes flash-red {
    0%, 100% { background: #f8d7da; }
    50% { background: #f5c6cb; }
  }
`;

export const TOAST_STYLES = `
  :host {
    all: initial;
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .toast {
    background: #333;
    color: #fff;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 14px;
    line-height: 1.5;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    max-width: 360px;
    animation: slide-in 0.3s ease;
  }

  .toast .result {
    font-weight: bold;
    color: #4fc3f7;
    font-size: 18px;
    letter-spacing: 2px;
  }

  .toast .hint {
    font-size: 12px;
    color: #aaa;
    margin-top: 4px;
  }

  @keyframes slide-in {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
`;
