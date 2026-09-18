# VW-DS10 | Web Audio Analogue Engine

The VW-DS10 is a browser-based, dual-oscillator subtractive synthesiser and 4-part drum machine, entirely powered by the Web Audio API. 

This project is inspired by the legendary KORG DS-10 synthesiser cartridge released for the Nintendo DS in 2008 (which itself was a digital recreation of the classic KORG MS-10 analogue synthesiser). The VW-DS10 pays homage to that iconic dual-screen groovebox by recreating its core sonic architecture—including the patching system, sequencer, and Kaoss pad—while modernising the interface to match the tactile hardware design language of our very VW-D16 Drum Machine.

## Features
*   **Dual Subtractive Voices (SYN1 & SYN2):** Independent VCO, VCF (resonant lowpass), and VCA/EG modules.
*   **4-Part Analogue Drum Machine:** Synthesised kicks, snares, hi-hats, and toms using noise buffers and frequency-modulated oscillators.
*   **Modulation Matrix (Patch Bay):** Route LFO signals to synth pitches and filter cutoffs using a dynamic patching interface.
*   **Kaoss Pad:** An X/Y performance controller for live manipulation of pitch and filter resonance, complete with envelope triggering.
*   **Lookahead Sequencer & Song Mode:** 16-step programming with A/B pattern chaining.
*   **Master FX:** Built-in chorus and delay.
*   **DAW Stem Export:** Record your live performance and sequence simultaneously, automatically decoding into phase-locked `.wav` stems (Master, SYN1, SYN2, Drums) for immediate DAW integration.

## Usage
No build steps or dependencies are required. Simply open `index.html` in any modern web browser to start the audio engine. Rock&roll!
