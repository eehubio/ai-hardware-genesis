import React from 'react';

/**
 * 错误边界 —— F-01 的最后防线。
 * 任何子树渲染异常只在此处显示错误卡片,不再清空整个应用(#root)。
 * scope="module" 用于画布单个模块卡片;默认用于整页内容区。
 */
interface Props {
  children: React.ReactNode;
  scope?: 'app' | 'module';
  label?: string;
}
interface State {
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', this.props.label || this.props.scope, error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    if (this.props.scope === 'module') {
      // 单模块错误卡片:不影响画布其他模块
      return (
        <div className="p-3 bg-red-50 border border-red-200 rounded-eng-lg text-body text-red-700 max-w-xs">
          <div className="font-semibold mb-0.5">⚠ 模块渲染异常</div>
          <div className="text-meta text-red-500">
            {this.props.label ? `「${this.props.label}」` : '该模块'}数据格式异常,已跳过显示。其他模块不受影响。
          </div>
        </div>
      );
    }

    // 整页级:显示可恢复的错误页,而不是白屏
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-3">
          <div className="text-h3 text-ink-900">页面渲染出错</div>
          <p className="text-body text-ink-500">
            某个组件的数据格式异常导致渲染失败。你的项目数据仍在,可尝试返回上一步或刷新。
          </p>
          <div className="text-meta font-mono text-ink-400 bg-ink-50 border border-ink-200 rounded-eng p-2 text-left overflow-auto max-h-24">
            {String(this.state.error?.message || this.state.error)}
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 bg-brand-600 text-white rounded-eng-lg text-body font-semibold hover:bg-brand-700"
          >
            重试渲染
          </button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
