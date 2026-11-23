import { useState } from 'react';
import { PageHeader, SectionCard, Stat } from '../components/CommandCenter';
import { useSpeech } from '../hooks/useSpeech';
import { useTts } from '../hooks/useTts';
import { apiFetch, fetchSpeechHealth, fetchTtsHealth } from '../lib/api';
import { useResource } from '../components/CommandCenter';
import { useAppStore } from '../lib/store';

/** Voice assistant built on the existing STT, TTS and chat endpoints. */
export function VoicePage() {
  const speech = useSpeech();
  const tts = useTts();
  const sttHealth = useResource(() => fetchSpeechHealth());
  const ttsHealth = useResource(() => fetchTtsHealth());
  const selectedModel = useAppStore((s) => s.selectedModel);
  const [transcript, setTranscript] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async () => {
    if (!transcript.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch('/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel || undefined,
          stream: false,
          messages: [{ role: 'user', content: transcript.trim() }],
        }),
      });
      if (!res.ok) throw new Error(`Chat request failed: ${res.status}`);
      const data = await res.json() as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content ?? '';
      setReply(text);
      if (text && tts.available) void tts.speak('voice-reply', text);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fj-page flex-1 overflow-y-auto">
      <div className="fj-shell">
        <PageHeader
          kicker="Conversation"
          title="Voice Assistant"
          description="Speak to JARVIS using the configured speech-to-text backend, then hear the reply with the local TTS engine when available."
        />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="Speech input" value={sttHealth.data?.available ? 'Available' : 'Unavailable'} />
          <Stat label="Speech output" value={tts.available ? 'Available' : 'Unavailable'} />
          <Stat label="Microphone" value={speech.isRecording ? 'Recording' : 'Idle'} />
          <Stat label="Voice model" value={selectedModel || 'Server default'} />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <SectionCard title="Speak" hint="Microphone audio is transcribed by your configured STT backend.">
            <div className="flex gap-2">
              <button
                className="fj-button"
                disabled={speech.isRecording || speech.isTranscribing}
                onClick={() => void speech.startRecording()}
              >
                Start recording
              </button>
              <button
                className="fj-button"
                disabled={!speech.isRecording}
                onClick={() => void speech.stopRecording().then(setTranscript).catch((e: unknown) => setError(String(e)))}
              >
                Stop & transcribe
              </button>
            </div>
            <textarea
              className="fj-input mt-4"
              rows={5}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Transcript appears here — or type a message"
            />
            <button className="fj-button mt-3" disabled={busy || !transcript.trim()} onClick={() => void ask()}>
              {busy ? 'Thinking…' : 'Ask JARVIS'}
            </button>
          </SectionCard>

          <SectionCard title="Reply" hint="Use the local TTS engine or the browser speech synthesizer.">
            <textarea
              className="fj-input"
              rows={5}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="The assistant's reply appears here"
            />
            <div className="mt-3 flex gap-2">
              <button className="fj-button" disabled={!reply.trim() || !tts.available} onClick={() => void tts.speak('manual-reply', reply)}>Speak reply</button>
              <button className="fj-button" disabled={!tts.isSpeaking} onClick={tts.stop}>Stop</button>
            </div>
            {speech.error || tts.error || error ? (
              <p className="fj-error mt-4">{[speech.error, tts.error, error].filter(Boolean).join(' — ')}</p>
            ) : null}
            {!sttHealth.data?.available ? (
              <p className="fj-note mt-4">Server STT is not configured. Browser microphone capture still requires a supported browser and permission.</p>
            ) : null}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
