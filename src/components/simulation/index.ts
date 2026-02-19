/**
 * Re-exports all simulation panel components for easy imports.
 * Refactored: 2026-02-16
 */

// Panels
export { ActivityFeedPanel } from './ActivityFeedPanel';
export { PostDetailPanel } from './PostDetailPanel';
export { BotMetricsPanel } from './BotMetricsPanel';
export { AirQualityPanel } from './AirQualityPanel';
export { PhysicalNeedsPanel } from './PhysicalNeedsPanel';
export { WeatherStatsPanel } from './WeatherStatsPanel';
export { AllBotsPanel } from './AllBotsPanel';
export { StatusBar } from './StatusBar';
export { DraggablePanel } from './DraggablePanel';

// Reusable components
export { NeedsMeter, NeedsMeterWithIcon, NeedsGridCard } from './NeedsMeter';

// Re-export types for convenience
export type { ActivityFeedPanelProps } from './ActivityFeedPanel';
export type { PostDetailPanelProps } from './PostDetailPanel';
export type { BotMetricsPanelProps } from './BotMetricsPanel';
export type { AirQualityPanelProps } from './AirQualityPanel';
export type { PhysicalNeedsPanelProps } from './PhysicalNeedsPanel';
export type { StatusBarProps } from './StatusBar';
export type { NeedsMeterProps, NeedsMeterWithIconProps, NeedsGridCardProps } from './NeedsMeter';
