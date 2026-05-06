import { useEffect, useState } from 'react';
import { useFetcher } from '@remix-run/react';

interface BriefData {
  mode: string;
  lastContact?: {
    channel: string;
    when: string;
    summary: string;
  };
  skysPlay?: string;
  talkingPoints?: string[];
  likelyObjections?: Array<{
    objection: string;
    response: string;
  }>;
  suggestedOpener?: string;
  history?: Array<{
    channel: string;
    when: string;
    direction: string;
    summary: string;
  }>;
}

interface SalesFloorBriefModalProps {
  orgName: string;
  contactPhone?: string | null;
  contactEmail?: string | null;
  contactName?: string | null;
  contactFirstName?: string | null;
  orgWebsite?: string | null;
  zohoAccountId?: string | null;
  lifecycleStage?: string | null;
  onClose: () => void;
}

const DESIGN_TOKENS = {
  bg: '#0A0A0A',
  surface: '#141414',
  surfaceElev: '#1A1A1A',
  border: '#1F1F1F',
  borderStrong: '#2F2F2F',
  text: '#F5F5F5',
  textMuted: '#C8C8C8',
  textSubtle: '#9C9C9C',
  textFaint: '#6A6A6A',
  yellow: '#FFD500',
  cyan: '#00D4FF',
  green: '#00E676',
  magenta: '#FF3B7F',
  redSystems: '#FF3355',
  statusWarn: '#FFB300',
};

function getChannelColor(channel: string): string {
  const ch = channel?.toUpperCase() || '';
  if (ch === 'CALL') return DESIGN_TOKENS.green;
  if (ch === 'SMS' || ch === 'sms') return DESIGN_TOKENS.cyan;
  if (ch === 'EMAIL' || ch === 'email') return DESIGN_TOKENS.yellow;
  return DESIGN_TOKENS.textMuted;
}

function ChannelBadge({ channel }: { channel: string }) {
  const color = getChannelColor(channel);
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 8px',
        borderRadius: '3px',
        backgroundColor: `${color}20`,
        color,
        fontSize: '11px',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}
    >
      {channel}
    </span>
  );
}

export function SalesFloorBriefModal({
  orgName,
  contactPhone,
  contactEmail,
  contactName,
  contactFirstName,
  orgWebsite,
  zohoAccountId,
  lifecycleStage,
  onClose,
}: SalesFloorBriefModalProps) {
  const fetcher = useFetcher<{ ok: boolean; brief?: BriefData; mode?: string; sources?: any }>();
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    // Parse name into first and last
    let firstName = contactFirstName;
    let lastName = '';

    if (!firstName && contactName) {
      const parts = contactName.split(' ');
      firstName = parts[0];
      lastName = parts.slice(1).join(' ');
    }

    const briefPayload = {
      lead: {
        First_Name: firstName || '',
        Last_Name: lastName || '',
        _fullName: contactName || orgName,
        Company: orgName,
        Phone: contactPhone || '',
        Email: contactEmail || '',
        _status: lifecycleStage || 'active',
        Website: orgWebsite || '',
        _zohoModule: 'Accounts',
        _zohoId: zohoAccountId || '',
      },
    };

    setIsLoading(true);
    setHasError(false);
    fetcher.submit(briefPayload, {
      method: 'POST',
      action: '/api/brief',
      encType: 'application/json',
    });
  }, [orgName, contactPhone, contactEmail, contactName, contactFirstName, orgWebsite, zohoAccountId, lifecycleStage, fetcher]);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      setIsLoading(false);
      if (!fetcher.data.ok) {
        setHasError(true);
      }
    }
  }, [fetcher.state, fetcher.data]);

  const briefData = fetcher.data?.brief as BriefData | undefined;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.88)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: DESIGN_TOKENS.surface,
          border: `1px solid ${DESIGN_TOKENS.borderStrong}`,
          borderRadius: '8px',
          width: '100%',
          maxWidth: '640px',
          maxHeight: '85vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '24px 24px 20px 24px',
            borderBottom: `1px solid ${DESIGN_TOKENS.border}`,
            position: 'sticky',
            top: 0,
            backgroundColor: DESIGN_TOKENS.surface,
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h2
              style={{
                margin: 0,
                fontSize: '24px',
                fontFamily: '"Teko", sans-serif',
                fontWeight: 700,
                color: DESIGN_TOKENS.text,
                letterSpacing: '1px',
              }}
            >
              BRIEF — {orgName}
            </h2>
            {briefData && (
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: '3px',
                  fontSize: '10px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  backgroundColor:
                    briefData.mode === 'COLD'
                      ? `${DESIGN_TOKENS.textMuted}30`
                      : `${DESIGN_TOKENS.green}30`,
                  color:
                    briefData.mode === 'COLD'
                      ? DESIGN_TOKENS.textMuted
                      : DESIGN_TOKENS.green,
                }}
              >
                {briefData.mode}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: DESIGN_TOKENS.textMuted,
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px' }}>
          {isLoading ? (
            <div
              style={{
                textAlign: 'center',
                padding: '40px 20px',
                color: DESIGN_TOKENS.textSubtle,
              }}
            >
              <div
                style={{
                  display: 'inline-block',
                  width: '24px',
                  height: '24px',
                  border: `2px solid ${DESIGN_TOKENS.border}`,
                  borderTop: `2px solid ${DESIGN_TOKENS.yellow}`,
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  marginBottom: '12px',
                }}
              />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <p>Building brief…</p>
            </div>
          ) : hasError ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <p style={{ color: DESIGN_TOKENS.redSystems, marginBottom: '16px' }}>
                Brief unavailable
              </p>
              <button
                onClick={() => {
                  setHasError(false);
                  setIsLoading(true);
                  fetcher.submit(
                    {
                      lead: {
                        Company: orgName,
                        _fullName: contactName || orgName,
                      },
                    },
                    { method: 'POST', action: '/api/brief', encType: 'application/json' }
                  );
                }}
                style={{
                  padding: '8px 16px',
                  backgroundColor: DESIGN_TOKENS.yellow,
                  color: DESIGN_TOKENS.bg,
                  border: 'none',
                  borderRadius: '4px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
              >
                Try again
              </button>
            </div>
          ) : briefData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Last Contact */}
              {briefData.lastContact && (
                <div>
                  <h3
                    style={{
                      margin: '0 0 12px 0',
                      fontSize: '11px',
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      color: DESIGN_TOKENS.textMuted,
                    }}
                  >
                    Last Contact
                  </h3>
                  <div
                    style={{
                      backgroundColor: DESIGN_TOKENS.surfaceElev,
                      border: `1px solid ${DESIGN_TOKENS.border}`,
                      borderRadius: '4px',
                      padding: '12px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                    }}
                  >
                    <ChannelBadge channel={briefData.lastContact.channel} />
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontSize: '12px',
                          color: DESIGN_TOKENS.textFaint,
                          marginBottom: '4px',
                        }}
                      >
                        {briefData.lastContact.when}
                      </div>
                      <div style={{ fontSize: '13px', color: DESIGN_TOKENS.text }}>
                        {briefData.lastContact.summary}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Sky's Play */}
              {briefData.skysPlay && (
                <div>
                  <h3
                    style={{
                      margin: '0 0 12px 0',
                      fontSize: '11px',
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      color: DESIGN_TOKENS.yellow,
                    }}
                  >
                    Sky's Play
                  </h3>
                  <div
                    style={{
                      backgroundColor: `${DESIGN_TOKENS.yellow}10`,
                      border: `1px solid ${DESIGN_TOKENS.yellow}40`,
                      borderRadius: '4px',
                      padding: '12px',
                      fontSize: '13px',
                      color: DESIGN_TOKENS.text,
                      lineHeight: '1.5',
                    }}
                  >
                    {briefData.skysPlay}
                  </div>
                </div>
              )}

              {/* Talking Points */}
              {briefData.talkingPoints && briefData.talkingPoints.length > 0 && (
                <div>
                  <h3
                    style={{
                      margin: '0 0 12px 0',
                      fontSize: '11px',
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      color: DESIGN_TOKENS.textMuted,
                    }}
                  >
                    Talking Points
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {briefData.talkingPoints.map((point, idx) => (
                      <div
                        key={idx}
                        style={{
                          backgroundColor: DESIGN_TOKENS.surfaceElev,
                          border: `1px solid ${DESIGN_TOKENS.border}`,
                          borderRadius: '4px',
                          padding: '12px',
                          display: 'flex',
                          gap: '12px',
                          alignItems: 'flex-start',
                        }}
                      >
                        <span
                          style={{
                            minWidth: '20px',
                            fontSize: '12px',
                            fontWeight: '700',
                            color: DESIGN_TOKENS.yellow,
                          }}
                        >
                          {idx + 1}.
                        </span>
                        <span style={{ fontSize: '13px', color: DESIGN_TOKENS.text }}>
                          {point}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Likely Objections */}
              {briefData.likelyObjections && briefData.likelyObjections.length > 0 && (
                <div>
                  <h3
                    style={{
                      margin: '0 0 12px 0',
                      fontSize: '11px',
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      color: DESIGN_TOKENS.textMuted,
                    }}
                  >
                    Likely Objections
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {briefData.likelyObjections.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          backgroundColor: DESIGN_TOKENS.surfaceElev,
                          border: `1px solid ${DESIGN_TOKENS.border}`,
                          borderRadius: '4px',
                          padding: '12px',
                        }}
                      >
                        <div
                          style={{
                            fontSize: '13px',
                            fontWeight: '600',
                            color: DESIGN_TOKENS.text,
                            marginBottom: '8px',
                          }}
                        >
                          {item.objection}
                        </div>
                        <div
                          style={{
                            fontSize: '12px',
                            color: DESIGN_TOKENS.textFaint,
                            lineHeight: '1.4',
                          }}
                        >
                          {item.response}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Suggested Opener */}
              {briefData.suggestedOpener && (
                <div>
                  <h3
                    style={{
                      margin: '0 0 12px 0',
                      fontSize: '11px',
                      fontWeight: '700',
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      color: DESIGN_TOKENS.cyan,
                    }}
                  >
                    Suggested Opener
                  </h3>
                  <div
                    style={{
                      backgroundColor: `${DESIGN_TOKENS.cyan}10`,
                      border: `1px solid ${DESIGN_TOKENS.cyan}40`,
                      borderRadius: '4px',
                      padding: '12px',
                      fontSize: '13px',
                      color: DESIGN_TOKENS.text,
                      lineHeight: '1.5',
                      fontStyle: 'italic',
                    }}
                  >
                    "{briefData.suggestedOpener}"
                  </div>
                </div>
              )}

              {/* History (Collapsible) */}
              {briefData.history && briefData.history.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowHistory(!showHistory)}
                    style={{
                      width: '100%',
                      padding: '12px',
                      backgroundColor: DESIGN_TOKENS.surfaceElev,
                      border: `1px solid ${DESIGN_TOKENS.border}`,
                      borderRadius: '4px',
                      color: DESIGN_TOKENS.text,
                      fontSize: '12px',
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    History ({briefData.history.length})
                    <span
                      style={{
                        transform: showHistory ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s',
                        display: 'inline-block',
                      }}
                    >
                      ▼
                    </span>
                  </button>
                  {showHistory && (
                    <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {briefData.history.slice(0, 6).map((event, idx) => (
                        <div
                          key={idx}
                          style={{
                            backgroundColor: DESIGN_TOKENS.surfaceElev,
                            border: `1px solid ${DESIGN_TOKENS.border}`,
                            borderRadius: '4px',
                            padding: '12px',
                            fontSize: '12px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <ChannelBadge channel={event.channel} />
                            <span style={{ color: DESIGN_TOKENS.textFaint }}>
                              {event.direction} • {event.when}
                            </span>
                          </div>
                          <div style={{ color: DESIGN_TOKENS.text }}>{event.summary}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
