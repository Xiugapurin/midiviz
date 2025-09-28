# midiviz/visualizer.py

import pretty_midi
import base64
import json
import os
import uuid
import random
import re
from . import themes
from midi2audio import FluidSynth
from IPython.display import HTML


def get_note_name(note_name: str) -> str:
    """Converts a sharp note name to its sharp/flat equivalent, e.g., F#4 -> F#4/Gb4."""
    if "#" not in note_name:
        return note_name

    match = re.match(r"([A-G]#)(\d+)", note_name)
    if not match:
        return note_name

    sharp_note, octave = match.groups()

    sharp_to_flat = {"C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb"}

    flat_equivalent = sharp_to_flat.get(sharp_note)
    if not flat_equivalent:
        return note_name

    return f"{sharp_note}{octave}/{flat_equivalent}{octave}"


class MidiViz:
    def __init__(self, midi_path: str, soundfont_path: str):
        """
        Initializes the MidiViz object.

        Args:
            midi_path (str): The file path to the MIDI file.
            soundfont_path (str): The file path to the SoundFont (.sf2) file.
        """
        if not os.path.exists(midi_path):
            raise FileNotFoundError(f"MIDI file not found at: {midi_path}")
        if not os.path.exists(soundfont_path):
            raise FileNotFoundError(f"SoundFont file not found at: {soundfont_path}")

        self.midi_path = midi_path
        self.soundfont_path = soundfont_path
        self.pm = pretty_midi.PrettyMIDI(self.midi_path)

    def show(
        self,
        mode: str = "pianoroll",
        theme: dict = themes.CLASSIC,
        custom_palette: list = None,
        show_grid: bool = True,
        config: dict = None,
        height: int = None,
        padding: int = 2,
    ) -> HTML:
        """
        Generates and displays the MIDI visualization.

        Args:
            mode (str): The visualization mode. Can be "pianoroll" or "waterfall".
                        Defaults to "pianoroll".
            theme (dict): A predefined theme dictionary from themes.py.
                          Defaults to themes.CLASSIC.
            custom_palette (list, optional): A list of custom color strings to use for tracks.
                                             If provided, this overrides the theme's palette. Defaults to None.
            show_grid (bool): Whether to display beat and measure gridlines. Defaults to True.
            config (dict, optional): A dictionary of advanced JS configurations to override defaults.
                                     Defaults to None.
            height (int, optional): A manual height in pixels for the canvas. Defaults to None (auto-sizing).
            padding (int): Number of semitones to pad above and below the highest/lowest notes
                         in pianoroll mode. Defaults to 2.

        Returns:
            IPython.display.HTML: An HTML object ready to be displayed in a Jupyter cell.
        """
        all_notes = []
        track_names = []
        for i, instrument in enumerate(self.pm.instruments):
            track_names.append(instrument.name if instrument.name else f"Track {i+1}")
            for note in instrument.notes:
                all_notes.append(
                    {
                        "pitch": note.pitch,
                        "start": note.start,
                        "end": note.end,
                        "velocity": note.velocity,
                        "name": get_note_name(
                            pretty_midi.note_number_to_name(note.pitch)
                        ),
                        "track": i,
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

        final_palette = []
        background_color = "#FFFFFF"

        if custom_palette:
            final_palette = custom_palette
            background_color = themes.CLASSIC.get("backgroundColor")
        elif theme:
            final_palette = theme.get("palette", [])
            background_color = theme.get("backgroundColor", "#FFFFFF")

        num_tracks = len(self.pm.instruments)
        if len(final_palette) < num_tracks:
            for _ in range(num_tracks - len(final_palette)):
                r = random.randint(50, 200)
                g = random.randint(50, 200)
                b = random.randint(50, 200)
                final_palette.append(f"#{r:02x}{g:02x}{b:02x}")

        user_config = config or {}
        user_config["palette"] = final_palette
        user_config["backgroundColor"] = background_color
        user_config["showGrid"] = show_grid

        viz_data = {
            "mode": mode,
            "audioData": audio_data_uri,
            "notesData": all_notes,
            "trackNames": track_names,
            "beatTimes": list(self.pm.get_beats()),
            "downbeatTimes": list(self.pm.get_downbeats()),
            "userConfig": user_config,
            "manualHeight": height,
            "minPitch": min_pitch,
            "maxPitch": max_pitch,
            "padding": padding,
        }

        safe_viz_data_json = json.dumps(viz_data).replace('"', "&quot;")

        try:
            base_dir = os.path.dirname(__file__)
            js_path = os.path.join(base_dir, "static", "main.js")
            with open(js_path, "r", encoding="utf-8") as f:
                main_js_code = f.read()
        except FileNotFoundError:
            error_msg = f"<b>Error:</b> Could not find <code>main.js</code> at the expected path: <code>{js_path}</code>."
            return HTML(f"<div style='color: red;'>{error_msg}</div>")

        if mode == "pianoroll":
            canvas_html = """
                <div style="position: relative; display: flex;">
                    <canvas class="labels-canvas" style="background-color: #f8f8f8;"></canvas>
                    <canvas class="piano-roll-canvas"></canvas>
                </div>
            """
        elif mode == "waterfall":
            canvas_html = """
                <canvas class="static-canvas" style="position: absolute; left: 0; top: 0; z-index: 1;"></canvas>
                <canvas class="dynamic-canvas" style="position: relative; z-index: 2;"></canvas>
            """
        else:
            raise ValueError(
                "Invalid mode specified. Choose from 'pianoroll' or 'waterfall'."
            )

        html_output = f"""
        <div id="{element_id}" data-viz-data="{safe_viz_data_json}" style="width: 100%; height: auto; font-family: sans-serif; position: relative;">
            <div class="controls" style="display: flex; align-items: center; gap: 8px; padding-bottom: 8px; position: relative; z-index: 10;">
                <button class="play-pause-btn" style="width: 34px; height: 34px; border-radius: 50%; border: 1px solid #ccc; display: flex; align-items: center; justify-content: center; padding: 0; cursor: pointer;"></button>
                <span class="time-display" style="font-family: monospace; white-space: nowrap;">00:00 / --:--</span>
                <input type="range" class="progress-bar" value="0" step="0.1" style="flex-grow: 1; max-width: 300px; margin: 0 5px;">
                <div class="volume-control" style="display: flex; align-items: center; gap: 5px;">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="#555555"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"></path></svg>
                    <input type="range" class="volume-slider" min="0" max="1" step="0.01" value="1" style="width: 80px;">
                </div>
            </div>
            <div class="visualizer" style="position: relative; z-index: 1; border: 1px solid #ccc;">
                {canvas_html}
            </div>
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

        return HTML(html_output)
