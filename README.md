# VW-DS10 | Web Audio Analogue Engine

The VW-DS10 is a browser-based, dual-oscillator subtractive synthesiser and 4-part drum machine, entirely powered by the Web Audio API. 

This project is inspired by the legendary KORG DS-10 synthesiser cartridge released for the Nintendo DS in 2008 (which itself was a digital recreation of the classic KORG MS-10 analogue synthesiser). The VW-DS10 pays homage to that iconic dual-screen groovebox by recreating its core sonic architecture—including the patching system, sequencer, and Kaoss pad—while modernising the interface to match the tactile hardware design language of our very own VW-D16 Drum Machine.

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

---

## User Manual

The VW-DS10 is divided into eight primary modules, accessible via the top navigation tabs. 

### 1. SYN1 & SYN2 (Subtractive Voices)
The core of the VW-DS10 consists of two identical monophonic analogue-style synthesisers. 
*   **VCO (Voltage Controlled Oscillator):** Select your foundational waveform (Sawtooth, Square, Triangle, Sine). Adjust the **OCTAVE** to shift the base pitch up or down, and use the **TUNE** knob for fine-tuning.
*   **LEGATO:** When turned **OFF**, every new note completely restarts the volume and filter envelopes (producing a distinct "pluck"). When turned **ON**, overlapping notes will glide smoothly to the new pitch without re-triggering the envelopes, perfect for sliding basslines.
*   **VCF (Voltage Controlled Filter):** A resonant lowpass filter. Use **CUTOFF** to remove high frequencies and **PEAK** (resonance) to boost the frequencies right at the cutoff point. The **EG>VCF** knob determines how intensely the Envelope Generator modulates the cutoff frequency over time.
*   **EG (Envelope Generator):** Shapes the volume and filter over time using standard ADSR stages: **ATTACK** (fade-in time), **DECAY** (drop from peak time), **SUSTAIN** (resting level while held), and **RELEASE** (fade-out time after letting go).
*   **AMP & TEST:** Use the **HOLD TO TEST** button to manually trigger the synth voice to audition your sound design, and adjust the **LEVEL** knob to balance the voice within the main mix.

### 2. DRUM (Percussion)
A 4-part analogue-modelled drum machine featuring Kick, Snare, Hi-Hat, and Tom. These sounds are generated mathematically in real-time using noise buffers and pitch-dropped oscillators. The Drum tab provides manual trigger buttons for live finger-drumming or auditioning the sounds.

### 3. PATCH (Modulation Matrix)
The Patch Bay allows you to route a Low Frequency Oscillator (LFO) to various parameters on SYN1 and SYN2 to create movement, vibrato, or rhythmic pulsing.
*   **LFO 1 SOURCE:** Select the modulation waveform (Sine, Triangle, Square) and set the **LFO RATE** (speed).
*   **MODULATION MATRIX:** To patch a cable, click on a grey **JACK** destination (e.g., SYN1 CUTOFF). The jack will illuminate red to indicate an active connection. Once patched, use the **DEPTH** slider below it to dictate how intensely the LFO affects that parameter.

### 4. SEQ (16-Step Sequencer)
Programme your melodies and drum beats here. 
*   **Track Selection:** Click a track button (SYN1, SYN2, KICK, etc.) to view and edit its specific 16-step grid.
*   **Programming Notes:** For the drum tracks, simply click a step to toggle it on or off. For SYN1 and SYN2, first select your desired pitch from the **NOTE** dropdown menu, *then* click an empty step to assign that pitch to the grid. 
*   **Patterns:** You can programme two distinct 16-step sequences (**PATTERN A** and **PATTERN B**).
*   **Transport:** Use the **TEMPO** slider to adjust the global BPM. Click **PLAY** to start the sequence. 

### 5. SONG (Arrangement Mode)
Song Mode allows you to chain Pattern A and Pattern B together to create full arrangements.
*   Click **+ A** or **+ B** to append that pattern to your song chain.
*   Click **CLEAR** to wipe the chain and start over.
*   Press **PLAY SONG** to tell the sequencer to follow your programmed chain rather than looping a single pattern.

### 6. KAOSS (Performance Pad)
The Kaoss Pad is an X/Y touch controller for expressive live performance. 
*   Select your **TARGET** (SYN1 or SYN2). 
*   Clicking and dragging inside the grid will immediately trigger the synth's envelope. Moving horizontally (X-axis) controls the **PITCH**, while moving vertically (Y-axis) controls the filter **CUTOFF**. 
*   *Note: Any performance on the Kaoss pad routes directly through the targeted synth's audio channel, meaning it will be captured perfectly in that specific stem during recording.*

### 7. FX (Master Effects)
Global effects applied to the master bus.
*   **CHORUS:** A rich modulation effect. Toggle it ON, then adjust **RATE** (wobble speed) and **DEPTH** (intensity).
*   **DELAY:** An echo effect. Toggle it ON, then adjust **TIME** (delay length), **FEEDBACK** (number of repeats), and **MIX** (dry/wet balance).

### 8. STEM EXPORT (Recording)
The VW-DS10 features a built-in, DAW-ready multitrack recorder. It isolates your instruments onto separate buses and records them simultaneously, ensuring your stems are perfectly phase-locked.
*   Click **● REC** to begin capturing audio. You can perform live on the Kaoss pad, tweak knobs, and switch sequencer patterns while recording.
*   Click **■ STOP** to end the take. The engine will automatically decode the audio and pack it into pristine PCM `.wav` files.
*   Once the **ENCODING** process finishes, the download chips will light up. Click **MSTR** (Master Mix), **SYN1**, **SYN2**, and **DRUM** to save your isolated tracks directly to your hard drive, ready to be dropped into Ableton, Logic, FL Studio, or any other DAW.
