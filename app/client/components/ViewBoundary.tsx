// app/client/components/ViewBoundary.tsx
// One view crashing must not take the app down (spec §15).
import { Component, type ReactNode } from 'react'

export class ViewBoundary extends Component<{ view: string; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-6 text-sm">
          <p className="font-medium">The {this.props.view} view couldn't render.</p>
          <p className="text-muted-foreground">{this.state.error.message}</p>
        </div>
      )
    }
    return this.props.children
  }
}
