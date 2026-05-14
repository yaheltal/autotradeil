import { Component, ReactNode } from "react";
import { View } from "react-native";

import { captureError } from "@/services/sentry";

import { ErrorState } from "./ErrorState";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    captureError(error, { componentStack: info.componentStack ?? undefined });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1 }}>
          <ErrorState message={this.state.error.message} onRetry={this.reset} />
        </View>
      );
    }
    return this.props.children;
  }
}
