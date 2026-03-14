let _ctx: AudioContext | null = null

function getCtx(): AudioContext {
  if (!_ctx || _ctx.state === 'closed') _ctx = new AudioContext()
  return _ctx
}

export async function playNotificationChime() {
  try {
    const ctx = getCtx()
    if (ctx.state === 'suspended') await ctx.resume()
    const now = ctx.currentTime
    const volume = 0.12

    // iMessage-style tri-tone: B5 → E6 → G#6
    const notes = [
      { freq: 988,  start: 0,     dur: 0.08,  fade: 0.12 },  // B5
      { freq: 1319, start: 0.08,  dur: 0.08,  fade: 0.12 },  // E6
      { freq: 1661, start: 0.16,  dur: 0.12,  fade: 0.16 },  // G#6
    ]

    // Subtle reverb via short delay feedback
    const delayNode = ctx.createDelay()
    delayNode.delayTime.setValueAtTime(0.03, now)
    const reverbGain = ctx.createGain()
    reverbGain.gain.setValueAtTime(0.25, now)
    delayNode.connect(reverbGain)
    reverbGain.connect(ctx.destination)

    for (const note of notes) {
      const t0 = now + note.start

      // Primary oscillator
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(note.freq, t0)
      gain.gain.setValueAtTime(volume, t0)
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + note.dur + note.fade)
      osc.connect(gain)
      gain.connect(ctx.destination)
      // Feed into reverb delay
      gain.connect(delayNode)
      osc.start(t0)
      osc.stop(t0 + note.dur + note.fade + 0.02)

      // Soft harmonic layer (one octave up, very quiet) for shimmer
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(note.freq * 2, t0)
      gain2.gain.setValueAtTime(volume * 0.15, t0)
      gain2.gain.exponentialRampToValueAtTime(0.001, t0 + note.dur + note.fade * 0.8)
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.start(t0)
      osc2.stop(t0 + note.dur + note.fade + 0.02)
    }
  } catch { /* audio not available */ }
}
