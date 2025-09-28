# MidiViz: Interactive MIDI Visualization in Jupyter Notebooks

**MidiViz** is a lightweight Python package designed to easily visualize and interact with MIDI files directly within a **Jupyter Notebook** or **Google Colab** environment.

It renders MIDI notes as a dynamic `waterfall` or a traditional `pianoroll`, synchronized with audio synthesized from a **SoundFont**. MidiViz is highly customizable, supporting multi-track color themes, detailed tooltips on hover, beat/measure gridlines, and other professional features.

## Demo

Here is a demonstration of the waterfall mode using the `CLASSIC` theme.

![](https://meee.com.tw/6VO8DkG.gif "Demo")

## Key Features

- **Two Visualization Modes**: Supports `waterfall` and `pianoroll` modes.
- **Multi-Track Coloring**: Automatically assigns distinct colors to different tracks in the MIDI file, making complex pieces easy to follow.
- **Customizable Themes**: Comes with several color themes and supports fully custom user-defined palettes.
- **Interactive Player**: Includes a full playback controller with play/pause, a draggable seek bar, time display, and volume control.
- **Note Info Tooltip**: Hover over any note on the canvas to see its detailed information (track name, timing, pitch name, velocity, etc.).
- **Beat & Measure Gridlines**: Renders beat lines and numbered measure lines on the canvas to help understand the musical structure.

## Installation & Usage

1. Install Package
   You can install MidiViz directly from PyPI:

   ```bash
   pip install midiviz
   ```

2. Install System Dependencies (FluidSynth)
   This package uses `midi2audio` for audio synthesis, which relies on a system-level synthesizer. **FluidSynth** is strongly recommended.
   - **macOS**:
     ```bash
     brew install fluidsynth
     ```
   - **Ubuntu / Debian**:
     ```bash
     sudo apt-get install fluidsynth
     ```
   - **Windows**:
   1. Go to the [FluidSynth GitHub Releases page](https://github.com/FluidSynth/fluidsynth/releases).
   2. Download the latest `.zip` archive that includes `win64` (or `win32`) in its name.
   3. Extract the archive to a stable location (e.g., `C:\dev\fluidsynth`).
   4. **Crucial Step**: Add the path to the `bin` directory inside the extracted folder (e.g., `C:\dev\fluidsynth\bin`) to your system's Environment Variables PATH.

### Basic Usage

Using MidiViz is straightforward. All you need is a MIDI file and a SoundFont (`.sf2`) file.

```python
from IPython.display import display
from midiviz.visualizer import MidiViz
from midiviz import themes

# Define your file paths
MIDI_FILE_PATH = 'path/to/your/midi_file.mid'
SOUNDFONT_PATH = 'path/to/your/soundfont.sf2'

# 1. Create a MidiViz instance
viz = MidiViz(midi_path=MIDI_FILE_PATH, soundfont_path=SOUNDFONT_PATH)

# 2. Display the visualization (defaults to "pianoroll" mode and CLASSIC theme)
display(viz.show())

# 3. Try "waterfall" mode with a different theme
display(viz.show(mode="waterfall", theme=themes.NIGHT))
```

## Customize

You can deeply customize the visualization through the various parameters of the `show()` method.

- `mode` (str):
  Sets the visualization mode. - "pianoroll": (Default) The classic piano roll view. - "waterfall": The falling-note "Synthesia" style view.

  ```python
  display(viz.show(mode="waterfall"))
  ```

- `theme` (dict):
  Selects a predefined color theme from the themes.py module. - Available themes: `CLASSIC`, `OCEAN`, `CUTE`, `HELL`, `FOREST`, `NIGHT`.

  ```python
  from midiviz import themes
  display(viz.show(theme=themes.FOREST))
  ```

- `custom_palette` (list):
  Pass your own list of color strings to override the theme's palette. If the number of tracks exceeds the number of colors, random colors will be generated to fill the gap.

  ```python
  my_colors = ["#e63946", "#f1faee", "#a8dadc", "#457b9d", "#1d3557"]
  display(viz.show(custom_palette=my_colors))
  ```

- `show_grid` (bool):
  Determines whether to display beat and measure gridlines. Defaults to `True`.

  ```python
  display(viz.show(show_grid=False))
  ```

- `height` (int):
  Manually sets a fixed height in pixels for the canvas. Defaults to `None` (auto-sizing).

- `padding` (int):
  In pianoroll mode, this sets the number of semitones to pad above the highest and below the lowest note. Defaults to `2`.

- `config` (dict):
  An advanced dictionary of frontend JavaScript configurations to override defaults. This allows for fine-grained control over the appearance and behavior of the visualizer.

### All Adjustable Properties:

| Property           | Type   | Description                                                               | Default Value              |
| :----------------- | :----- | :------------------------------------------------------------------------ | :------------------------- |
| noteHeight         | Number | The height in pixels of each semitone in pianoroll mode.                  | 5                          |
| noteWidth          | Number | The width in pixels of each white key in waterfall mode.                  | 16                         |
| pixelsPerSecond    | Number | The scrolling/falling speed. A higher value means faster movement.        | 100                        |
| playheadPosition   | Number | The horizontal position (in pixels) of the playhead in pianoroll mode.    | 80                         |
| playheadColor      | String | The color of the playhead line.                                           | "black"                    |
| gridColor          | String | The color of the non-measure beat lines in the background.                | "rgba(200, 200, 200, 0.6)" |
| labelFont          | String | The CSS font property for pitch labels (e.g., C4, C5).                    | "10px sans-serif"          |
| labelColor         | String | The color of the pitch labels.                                            | "#333"                     |
| labelWidth         | Number | The width in pixels of the label area in pianoroll mode.                  | 40                         |
| keyboardHeight     | Number | The height in pixels of the piano keyboard in waterfall mode.             | 60                         |
| verticalPitchRange | Array  | The MIDI pitch range [min_pitch, max_pitch] to display in waterfall mode. | [21, 108] (A0-C8)          |

### Example:

```python
# Create a custom config dictionary
custom_config = {
    "noteWidth": 20,           # Make the keys wider in waterfall mode
    "pixelsPerSecond": 150,    # Increase the falling speed by 50%
    "playheadColor": "#d62728"  # Change the playhead color to red
}

display(viz.show(
    mode="waterfall",
    config=custom_config,
    theme=themes.NIGHT
))
```

## Additional Notes

- **Performance**: For extremely long MIDI files with a very large number of notes, browser rendering performance may be impacted. The tool is best used with standard-length musical pieces for an optimal experience.
- **Contributing**: Contributions of any kind are welcome! If you have suggestions for new themes, ideas for features, or have found a bug, please feel free to open an Issue or Pull Request on GitHub.

## License

This project is licensed under the MIT License.
