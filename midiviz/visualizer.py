# midiviz/visualizer.py
# Version 13: Added velocity visualization and volume control.

import pretty_midi
import base64
import json
import os
from midi2audio import FluidSynth
from IPython.display import display, HTML
import uuid


class MidiViz:
    """
    A class to visualize and play MIDI files directly within a Jupyter Notebook.
    Supports horizontal (piano roll) and vertical (synthesia-style) modes.
    """

    def __init__(self, midi_path: str, soundfont_path: str):
        if not os.path.exists(midi_path):
            raise FileNotFoundError(f"MIDI file not found at: {midi_path}")
        if not os.path.exists(soundfont_path):
            raise FileNotFoundError(f"SoundFont file not found at: {soundfont_path}")

        self.midi_path = midi_path
        self.soundfont_path = soundfont_path
        self.pm = pretty_midi.PrettyMIDI(self.midi_path)

    def show(
        self,
        mode: str = "horizontal",
        height: int = None,
        config: dict = None,
        padding: int = 2,
    ):
        all_notes = []
        for instrument in self.pm.instruments:
            for note in instrument.notes:
                # UPDATED: Add velocity to the note data
                all_notes.append(
                    {
                        "pitch": note.pitch,
                        "start": note.start,
                        "end": note.end,
                        "velocity": note.velocity,
                        "name": pretty_midi.note_number_to_name(note.pitch),
                    }
                )

        if not all_notes:
            print("Warning: This MIDI file contains no notes.")
            return

        min_pitch = min(note["pitch"] for note in all_notes)
        max_pitch = max(note["pitch"] for note in all_notes)

        output_wav = f"temp_audio_{uuid.uuid4().hex}.wav"
        fs = FluidSynth(self.soundfont_path)
        fs.midi_to_audio(self.midi_path, output_wav)
        with open(output_wav, "rb") as f:
            audio_bytes = f.read()
        audio_data_uri = (
            "data:audio/wav;base64," + base64.b64encode(audio_bytes).decode()
        )
        os.remove(output_wav)

        element_id = f"midiviz-container-{uuid.uuid4().hex}"

        viz_data = {
            "mode": mode,
            "audioData": audio_data_uri,
            "notesData": all_notes,
            "userConfig": config or {},
            "manualHeight": height,
            "minPitch": min_pitch,
            "maxPitch": max_pitch,
            "padding": padding,
        }
        viz_data_json = json.dumps(viz_data).replace('"', "&quot;")

        try:
            base_dir = os.path.dirname(__file__)
            js_path = os.path.join(base_dir, "static", "main.js")
            with open(js_path, "r", encoding="utf-8") as f:
                main_js_code = f.read()
        except FileNotFoundError:
            error_msg = f"<b>Error:</b> Could not find <code>main.js</code> at the expected path: <code>{js_path}</code>.<br>Please ensure the file exists in the 'static' subdirectory next to your visualizer.py."
            return HTML(
                f"<div style='color: red; font-family: sans-serif; padding: 10px; border: 1px solid red; background-color: #fee;'>{error_msg}</div>"
            )

        visualizer_style = "position: relative; z-index: 1;"

        visualizer_html = ""
        if mode == "horizontal":
            visualizer_html = f"""<div class="visualizer" style="{visualizer_style} display: flex; border: 1px solid #ccc;"><canvas class="labels-canvas" style="background-color: #f8f8f8;"></canvas><canvas class="piano-roll-canvas" style="background-color: #ffffff;"></canvas></div>"""
        else:
            visualizer_html = f"""<div class="visualizer" style="{visualizer_style} border: 1px solid #ccc; background-color: #f8f8f8;">
                                   <canvas class="static-canvas" style="position: absolute; left: 0; top: 0; z-index: 1;"></canvas>
                                   <canvas class="dynamic-canvas" style="position: relative; z-index: 2;"></canvas>
                               </div>"""

        # UPDATED HTML TEMPLATE with volume controls
        html_template = f"""
        <div id="{element_id}" data-viz-data="{viz_data_json}" style="width: 100%; height: auto; font-family: sans-serif; position: relative;">
            <div class="controls" style="display: flex; align-items: center; gap: 8px; padding-bottom: 8px; position: relative; z-index: 10;">
                <button class="play-pause-btn" style="width: 34px; height: 34px; border-radius: 50%; border: 1px solid #ccc; display: flex; align-items: center; justify-content: center; padding: 0; cursor: pointer;"></button>
                <span class="time-display" style="font-family: monospace; white-space: nowrap;">00:00 / --:--</span>
                <input type="range" class="progress-bar" value="0" step="0.1" style="flex-grow: 1; max-width: 400px; margin: 0 5px;">
                <div class="volume-control" style="display: flex; align-items: center; gap: 5px;">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="#555555"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"></path></svg>
                    <input type="range" class="volume-slider" min="0" max="1" step="0.01" value="1" style="width: 80px;">
                </div>
            </div>
            {visualizer_html}
        </div>
        <script>
            {main_js_code}
            
            (function() {{
                const container = document.getElementById("{element_id}");
                if (container && typeof window.initMidiViz === 'function') {{
                    window.initMidiViz(container);
                }}
            }})();
        </script>
        """
        return HTML(html_template)
