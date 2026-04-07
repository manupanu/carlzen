import { FaCloud, FaCog, FaDownload, FaUpload } from 'react-icons/fa';

interface SettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  syncToken: string;
  setSyncToken: (value: string) => void;
  onSyncNow: () => void;
  syncStatus: string;
  isSyncing: boolean;
  isOnline: boolean;
  onExportSessions: () => void;
  onImportSessions: (file: File) => void;
  canInstall: boolean;
  onInstallApp: () => void;
}

export function SettingsSheet({
  isOpen,
  onClose,
  syncToken,
  setSyncToken,
  onSyncNow,
  syncStatus,
  isSyncing,
  isOnline,
  onExportSessions,
  onImportSessions,
  canInstall,
  onInstallApp,
}: SettingsSheetProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="sheet-backdrop" onClick={onClose} role="presentation">
      <aside
        className="settings-sheet glass-panel"
        onClick={(event) => event.stopPropagation()}
        aria-modal="true"
        aria-label="Application settings"
        role="dialog"
      >
        <div className="settings-sheet-header">
          <div>
            <p className="settings-sheet-kicker">Workspace</p>
            <h2>
              <FaCog /> CarlZen Setup
            </h2>
            <p className="settings-sheet-copy">
              Configure sync, keep local backups, and install the app for a cleaner full-screen experience.
            </p>
          </div>
          <button className="btn-secondary settings-close-btn" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="settings-grid">
          <section className="settings-card">
            <h3>
              <FaCloud /> Cross-device sync
            </h3>
            <p className="settings-card-copy">
              Use the same memorable token on each device. CarlZen keeps the newest saved state.
            </p>
            <div className={`sync-pill ${isOnline ? 'online' : 'offline'}`}>
              {isOnline ? 'Online' : 'Offline'}
            </div>
            <input
              type="text"
              placeholder="Enter your sync token..."
              value={syncToken}
              onChange={(event) => setSyncToken(event.target.value)}
              className="premium-input"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <button className="btn-secondary" onClick={onSyncNow} disabled={isSyncing || !syncToken.trim()}>
              {isSyncing ? 'Syncing...' : 'Sync now'}
            </button>
            <p className="sync-status-text">{syncStatus}</p>
          </section>

          <section className="settings-card">
            <h3>
              <FaDownload /> Backups
            </h3>
            <p className="settings-card-copy">
              Export your games to JSON before big edits, or import a backup to restore them later.
            </p>
            <div className="session-tools-row">
              <button className="btn-secondary" onClick={onExportSessions}>
                Export games
              </button>
              <label className="btn-secondary import-btn">
                <FaUpload /> Import games
                <input
                  type="file"
                  accept="application/json"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      onImportSessions(file);
                    }
                    event.target.value = '';
                  }}
                />
              </label>
            </div>
          </section>

          <section className="settings-card settings-card-wide">
            <h3>Install the app</h3>
            <p className="settings-card-copy">
              Install CarlZen to launch it like a native chess notebook with its own icon and standalone window.
            </p>
            {canInstall ? (
              <button className="btn-primary settings-install-btn" onClick={onInstallApp}>
                Install CarlZen
              </button>
            ) : (
              <div className="settings-install-note">
                <p className="settings-card-copy">
                  If your browser does not show an install prompt automatically, open the browser menu and choose
                  <strong> Install app</strong> or <strong>Add to Home Screen</strong>.
                </p>
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
