import React from 'react';
import type { UiTheme, SelectedBotInfo, BotNeeds, BotData } from '@/types/simulation';
import { NeedsMeter } from './NeedsMeter';

interface AllBotsPanelProps {
    uiTheme: UiTheme;
    bots: BotData[]; // Using BotData as it's the raw type from state, though page might transform it
    onClose: () => void;
    onSelectBot: (botId: string) => void;
}

export const AllBotsPanel: React.FC<AllBotsPanelProps> = ({ uiTheme, bots, onClose, onSelectBot }) => {

    // Helper to format state nicely
    const formatState = (state: string) => {
        return state.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    };

    // Helper for status color
    const getStatusColor = (state: string) => {
        if (state.includes('seeking')) return '#fbbf24'; // Yellow
        if (state.includes('critical')) return '#f87171'; // Red
        if (['sleeping', 'thinking'].includes(state)) return '#818cf8'; // Indigo
        if (state === 'idle') return '#9ca3af'; // Gray
        if (['gathering', 'building'].includes(state)) return '#34d399'; // Green
        return uiTheme.textPrimary;
    };

    // Sort bots by name for stability
    const sortedBots = [...bots].sort((a, b) => a.botName.localeCompare(b.botName));

    return (
        <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '900px', // Wide panel for table
            maxHeight: '80vh',
            background: uiTheme.panelBg,
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: `1px solid ${uiTheme.borderColor}`,
            borderRadius: '16px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            zIndex: 100, // Top level
            display: 'flex',
            flexDirection: 'column',
            fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            color: uiTheme.textPrimary,
            overflow: 'hidden'
        }}>
            {/* Header */}
            <div style={{
                padding: '20px 24px',
                borderBottom: `1px solid ${uiTheme.borderColor}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(0,0,0,0.1)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '24px' }}>👥</span>
                    <div>
                        <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.5px' }}>Active Bots Directory</div>
                        <div style={{ fontSize: '12px', color: uiTheme.textSecondary }}>{bots.length} agents currently online</div>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    style={{
                        background: 'transparent',
                        border: `1px solid ${uiTheme.borderColor}`,
                        color: uiTheme.textSecondary,
                        borderRadius: '8px',
                        width: '32px',
                        height: '32px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '14px',
                        transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                >
                    ✕
                </button>
            </div>

            {/* Table Container */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '0' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead style={{
                        background: 'rgba(0,0,0,0.2)',
                        position: 'sticky',
                        top: 0,
                        backdropFilter: 'blur(4px)',
                        zIndex: 10
                    }}>
                        <tr>
                            <th style={headerStyle(uiTheme)}>Identity</th>
                            <th style={headerStyle(uiTheme)}>Status</th>
                            <th style={headerStyle(uiTheme)}>Health (Homeostasis)</th>
                            <th style={headerStyle(uiTheme)}>Needs (Water / Food / Sleep)</th>
                            <th style={headerStyle(uiTheme)}>Inventory</th>
                            <th style={headerStyle(uiTheme)}>Lifetime Stats</th>
                            <th style={headerStyle(uiTheme)}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedBots.map((bot, index) => (
                            <tr
                                key={bot.botId}
                                style={{
                                    borderBottom: `1px solid ${uiTheme.borderColor}`,
                                    background: index % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                                    transition: 'background 0.2s'
                                }}
                                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                onMouseOut={(e) => e.currentTarget.style.background = index % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent'}
                            >
                                {/* Identity */}
                                <td style={cellStyle}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{
                                            width: '8px',
                                            height: '8px',
                                            borderRadius: '50%',
                                            background: bot.color || '#fff',
                                            boxShadow: `0 0 8px ${bot.color || '#fff'}`
                                        }} />
                                        <div>
                                            <div style={{ fontWeight: 700 }}>{bot.botName}</div>
                                            <div style={{ fontSize: '10px', color: uiTheme.textSecondary, textTransform: 'capitalize' }}>{bot.personality}</div>
                                        </div>
                                    </div>
                                </td>

                                {/* Status */}
                                <td style={cellStyle}>
                                    <div style={{
                                        display: 'inline-block',
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        background: 'rgba(0,0,0,0.2)',
                                        color: getStatusColor(bot.state),
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        border: `1px solid ${getStatusColor(bot.state)}40`
                                    }}>
                                        {formatState(bot.state)}
                                    </div>
                                </td>

                                {/* Health (Homeostasis) */}
                                <td style={{ ...cellStyle, width: '180px' }}>
                                    {bot.needs && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '12px', width: '30px', fontWeight: 600, color: bot.needs.homeostasis < 30 ? '#f87171' : uiTheme.textPrimary }}>
                                                {Math.round(bot.needs.homeostasis)}%
                                            </span>
                                            <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                                                <div style={{
                                                    width: `${bot.needs.homeostasis}%`,
                                                    height: '100%',
                                                    background: bot.needs.homeostasis > 60 ? '#4ade80' : bot.needs.homeostasis > 30 ? '#fbbf24' : '#f87171',
                                                    transition: 'width 0.5s ease'
                                                }} />
                                            </div>
                                        </div>
                                    )}
                                </td>

                                {/* Needs (Mini Bars) */}
                                <td style={{ ...cellStyle, width: '220px' }}>
                                    {bot.needs && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <MiniNeedBar label="💧" value={bot.needs.water} color="#60a5fa" />
                                            <MiniNeedBar label="🍽️" value={bot.needs.food} color="#fbbf24" />
                                            <MiniNeedBar label="😴" value={bot.needs.sleep} color="#818cf8" />
                                        </div>
                                    )}
                                </td>

                                {/* Inventory */}
                                <td style={cellStyle}>
                                    {bot.inventory && (
                                        <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: uiTheme.textSecondary }}>
                                            <span title="Wood">🪵 {bot.inventory.wood}</span>
                                            <span title="Stone">🪨 {bot.inventory.stone}</span>
                                            <span title="Water Items">🍶 {bot.inventory.water}</span>
                                            <span title="Food Items">🍎 {bot.inventory.food}</span>
                                        </div>
                                    )}
                                </td>

                                {/* Lifetime Stats */}
                                <td style={cellStyle}>
                                    {bot.lifetimeStats && (
                                        <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: uiTheme.textSecondary }}>
                                            <span title="Reproduction Count" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                💞 <span style={{ fontWeight: 600, color: uiTheme.textPrimary }}>{bot.lifetimeStats.reproductionCount}</span>
                                            </span>
                                            <span title="Shelters Built" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                🏠 <span style={{ fontWeight: 600, color: uiTheme.textPrimary }}>{bot.lifetimeStats.sheltersBuilt}</span>
                                            </span>
                                            <span title="Times Helped Others" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                🦸 <span style={{ fontWeight: 600, color: uiTheme.textPrimary }}>{bot.lifetimeStats.helpCount}</span>
                                            </span>
                                        </div>
                                    )}
                                </td>

                                {/* Actions */}
                                <td style={cellStyle}>
                                    <button
                                        onClick={() => onSelectBot(bot.botId)}
                                        style={{
                                            background: 'rgba(74, 158, 255, 0.1)',
                                            border: '1px solid rgba(74, 158, 255, 0.3)',
                                            color: '#60a5fa',
                                            borderRadius: '6px',
                                            padding: '4px 10px',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(74, 158, 255, 0.2)'}
                                        onMouseOut={(e) => e.currentTarget.style.background = 'rgba(74, 158, 255, 0.1)'}
                                    >
                                        Select
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// Styles
const headerStyle = (uiTheme: UiTheme): React.CSSProperties => ({
    textAlign: 'left',
    padding: '12px 16px',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '1px',
    color: uiTheme.textSecondary,
});

const cellStyle: React.CSSProperties = {
    padding: '12px 16px',
    verticalAlign: 'middle',
};

// Mini Bar Component
const MiniNeedBar = ({ label, value, color }: { label: string, value: number, color: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px' }}>
        <span style={{ minWidth: '14px' }}>{label}</span>
        <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ width: `${value}%`, height: '100%', background: color }} />
        </div>
    </div>
);
