export function playAddictiveDing() {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    
    // Create oscillator
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    // Pleasant high-pitched "ding" sound
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1); // Slide to A6
    
    // Addictive volume envelope
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05); // quick attack
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5); // smooth decay
    
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch (err) {
    // Ignore audio context errors if user hasn't interacted with page
  }
}
