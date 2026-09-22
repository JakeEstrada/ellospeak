import { useEffect, useRef, useState } from 'react';
import { BOARD_BUTTONS } from './boardButtons.js';
import { useSpeech } from '../hooks/useSpeech.js';
import { useSoundEffects } from '../hooks/useSoundEffects.js';
import './CommunicationBoard.css';

export default function CommunicationBoard() {
  const { speak, muted, toggleMute, mutedRef, openaiAvailable } = useSpeech();
  const { playTap, unlock } = useSoundEffects({ mutedRef });
  const [confirmation, setConfirmation] = useState(null); // the button object currently confirming
  const [confirmKey, setConfirmKey] = useState(0); // bump to force the pop animation to restart
  const [pulseId, setPulseId] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const hideTimer = useRef(null);

  const handleTap = (button) => {
    unlock();
    playTap();
    speak(button.word);

    setConfirmation(button);
    setConfirmKey((k) => k + 1);
    setPulseId(button.id);

    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setConfirmation(null), 2100);
  };

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">Tap &amp; Say</div>

        <div
          key={confirmKey}
          className={`confirm ${confirmation ? 'show' : ''}`}
          style={
            confirmation
              ? {
                  background: `var(--${confirmation.id})`,
                  color: `var(--${confirmation.id}-ink)`,
                }
              : undefined
          }
        >
          {confirmation ? `${confirmation.emoji}  ${confirmation.word}` : ''}
        </div>

        <div className="topbar-right">
          <button
            className="icon-btn"
            aria-label="How this board works"
            title="How this board works"
            onClick={() => setShowHelp(true)}
          >
            ?
          </button>
          <button
            className="icon-btn"
            aria-label={muted ? 'Unmute sound' : 'Mute sound'}
            aria-pressed={muted}
            title={muted ? 'Unmute sound' : 'Mute sound'}
            onClick={toggleMute}
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </div>

      <div className="board">
        {BOARD_BUTTONS.map((button) => (
          <button
            key={button.id}
            className={`cell ${button.id} ${pulseId === button.id ? 'pulse' : ''}`}
            aria-label={button.ariaLabel}
            onClick={() => handleTap(button)}
            onAnimationEnd={() => setPulseId((cur) => (cur === button.id ? null : cur))}
          >
            <span className="emoji">{button.emoji}</span>
            <span className="label">{button.word}</span>
          </button>
        ))}
      </div>

      {showHelp && (
        <div
          className="modal-back"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowHelp(false);
          }}
        >
          <div className="modal">
            <h2>How to use this board</h2>
            <p>
              The goal isn&rsquo;t vocabulary yet &mdash; it&rsquo;s helping him discover that
              touching a picture gets understood.
            </p>
            <div className="steps">
              picture <span className="arrow">→</span> word <span className="arrow">→</span> it
              happens
            </div>
            <p>
              <strong>Model it yourself first.</strong> Before handing him water, tap Drink and
              say &ldquo;drink&rdquo; &mdash; then give it to him. He starts noticing the
              connection.
            </p>
            <p>
              Don&rsquo;t make him prove he understands a button before honoring it. Every tap
              gets an immediate, understandable response.
            </p>
            <p>
              Run the words and layout past his speech-language pathologist before locking them
              in &mdash; consistent placement matters more than it seems.
            </p>
            <p>
              Each tap plays a sound and speaks the word out loud
              {openaiAvailable
                ? ' using a clearer cloud voice.'
                : ' using this device\u2019s built-in voice. Add an OpenAI key in .env for a nicer voice.'}
            </p>
            <button className="close" onClick={() => setShowHelp(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
