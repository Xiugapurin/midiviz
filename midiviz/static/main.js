// ./midiviz/static/main.js

window.initMidiViz = function (container) {
  // --- Global Instance Registry for Cleanup ---
  if (!window.midiVizInstances) {
    window.midiVizInstances = [];
  }
  window.midiVizInstances.forEach((instance) => instance.cleanup());
  window.midiVizInstances = [];

  // --- 1. Data Extraction & Config ---
  const vizData = JSON.parse(container.dataset.vizData.replace(/&quot;/g, '"'));
  const { mode, audioData, notesData, trackNames, beatTimes, downbeatTimes, userConfig, manualHeight, minPitch, maxPitch, padding } = vizData;

  const defaultConfig = {
    noteHeight: 5,
    noteWidth: 16,
    pixelsPerSecond: 100,
    playheadPosition: 80,
    playheadColor: "black",
    gridColor: "rgba(200, 200, 200, 0.6)",
    labelFont: "10px sans-serif",
    labelColor: "#333",
    labelWidth: 40,
    keyboardHeight: 60,
    verticalPitchRange: [21, 108],
    palette: ["#1f77b4"],
    backgroundColor: "#FFFFFF",
    showGrid: true,
  };
  const config = { ...defaultConfig, ...userConfig };

  // --- 2. Helper Functions ---
  function adjustColor(color, amount) {
    const tempCtx = document.createElement("canvas").getContext("2d");
    tempCtx.fillStyle = color;
    const hex = tempCtx.fillStyle;
    const r = parseInt(hex.slice(1, 3), 16),
      g = parseInt(hex.slice(3, 5), 16),
      b = parseInt(hex.slice(5, 7), 16);
    const clamp = (val) => Math.max(0, Math.min(255, val));
    return `rgb(${clamp(r + amount)}, ${clamp(g + amount)}, ${clamp(b + amount)})`;
  }
  function formatTime(seconds) {
    if (isNaN(seconds)) return "--:--";
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  /**
   * Manages all canvas rendering logic.
   */
  class MidiRenderer {
    constructor(container, config) {
      this.config = config;
      this.notePitchRange = { min: minPitch - padding, max: maxPitch + padding };
      this.keyboardPitchRange = { min: config.verticalPitchRange[0], max: config.verticalPitchRange[1] };

      this.setupCanvases(container, manualHeight);
    }

    setupCanvases(container, manualHeight) {
      if (mode === "pianoroll") {
        this.labelsCanvas = container.querySelector(".labels-canvas");
        this.canvas = container.querySelector(".piano-roll-canvas");
        this.labelsCtx = this.labelsCanvas.getContext("2d");
        this.ctx = this.canvas.getContext("2d");
        this.canvas.style.backgroundColor = this.config.backgroundColor;
        const pitchSpan = this.notePitchRange.max - this.notePitchRange.min + 1;
        const canvasHeight = manualHeight || pitchSpan * this.config.noteHeight;
        this.labelsCanvas.height = this.canvas.height = canvasHeight;
        this.labelsCanvas.width = this.config.labelWidth;
        this.canvas.width = container.querySelector(".visualizer").clientWidth - this.config.labelWidth;
        this.drawLabels(this.labelsCtx);
      } else {
        this.staticCanvas = container.querySelector(".static-canvas");
        this.canvas = container.querySelector(".dynamic-canvas");
        this.staticCtx = this.staticCanvas.getContext("2d");
        this.ctx = this.canvas.getContext("2d");
        container.querySelector(".visualizer").style.backgroundColor = this.config.backgroundColor;
        const firstKeyProps = this.getKeyProps(this.keyboardPitchRange.min);
        const lastKeyProps = this.getKeyProps(this.keyboardPitchRange.max);
        const canvasWidth = lastKeyProps.x + lastKeyProps.width - firstKeyProps.x;
        const canvasSize = { width: canvasWidth, height: manualHeight || 400 };
        this.staticCanvas.width = this.canvas.width = canvasSize.width;
        this.staticCanvas.height = this.canvas.height = canvasSize.height;
        this.drawStaticKeyboard(this.staticCtx, this.canvas.height);
      }
    }

    isBlack(p) {
      return [1, 3, 6, 8, 10].includes(p % 12);
    }

    getKeyProps(pitch) {
      const whiteKeyWidth = this.config.noteWidth;
      const isPBlack = this.isBlack(pitch);
      const whiteKeyPosMap = [0, 0.7, 1, 1.7, 2, 3, 3.7, 4, 4.7, 5, 5.7, 6];
      const octave = Math.floor(pitch / 12);
      const pitchClass = pitch % 12;
      const absolutePos = (octave * 7 + whiteKeyPosMap[pitchClass]) * whiteKeyWidth;
      const rangeOctave = Math.floor(this.keyboardPitchRange.min / 12);
      const rangePitchClass = this.keyboardPitchRange.min % 12;
      const rangeStartPos = (rangeOctave * 7 + whiteKeyPosMap[rangePitchClass]) * whiteKeyWidth;
      let x = absolutePos - rangeStartPos;
      let width = isPBlack ? whiteKeyWidth * 0.6 : whiteKeyWidth;
      return { x, width, isBlack: isPBlack };
    }

    draw(currentTime, activeNotes, hoveredNote) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.drawGridlines(currentTime);

      if (mode === "pianoroll") {
        this.drawHorizontalNotes(currentTime, hoveredNote);
      } else {
        this.drawHighlights(activeNotes, hoveredNote);
        this.drawStaticBlackKeys(activeNotes);
        this.drawVerticalNotes(currentTime, hoveredNote);
      }
      this.drawPlayhead(currentTime);
    }

    drawGridlines(currentTime) {
      if (!this.config.showGrid) return;
      this.ctx.lineWidth = 1;
      this.ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
      beatTimes.forEach((beat) => {
        if (mode === "waterfall") {
          const y = this.canvas.height - this.config.keyboardHeight - (beat - currentTime) * this.config.pixelsPerSecond;
          if (y > 0 && y < this.canvas.height - this.config.keyboardHeight) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
          }
        } else {
          const x = beat * this.config.pixelsPerSecond - (currentTime * this.config.pixelsPerSecond - this.config.playheadPosition);
          if (x > 0 && x < this.canvas.width) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
          }
        }
      });
      this.ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
      this.ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      this.ctx.font = "12px sans-serif";
      downbeatTimes.forEach((downbeat, index) => {
        const measureNumber = index + 1;
        if (mode === "waterfall") {
          const y = this.canvas.height - this.config.keyboardHeight - (downbeat - currentTime) * this.config.pixelsPerSecond;
          if (y > 0 && y < this.canvas.height - this.config.keyboardHeight) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
            this.ctx.textAlign = "left";
            this.ctx.textBaseline = "bottom";
            this.ctx.fillText(measureNumber, 5, y - 2);
          }
        } else {
          const x = downbeat * this.config.pixelsPerSecond - (currentTime * this.config.pixelsPerSecond - this.config.playheadPosition);
          if (x > 0 && x < this.canvas.width) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
            this.ctx.textAlign = "left";
            this.ctx.textBaseline = "top";
            this.ctx.fillText(measureNumber, x + 4, 2);
          }
        }
      });
    }

    drawHorizontalNotes(currentTime, hoveredNote) {
      notesData.forEach((note) => {
        const scrollOffset = currentTime * this.config.pixelsPerSecond - this.config.playheadPosition;
        const x = note.start * this.config.pixelsPerSecond - scrollOffset;
        const y = (this.notePitchRange.max - note.pitch) * this.config.noteHeight;
        const width = (note.end - note.start) * this.config.pixelsPerSecond;
        const height = this.config.noteHeight;
        if (x + width > 0 && x < this.canvas.width) {
          const isNoteActive = currentTime >= note.start && currentTime < note.end;
          let baseColor = this.config.palette[note.track % this.config.palette.length] || "#808080";
          if (note === hoveredNote) {
            baseColor = adjustColor(baseColor, 50);
          }
          if (isNoteActive) {
            baseColor = adjustColor(baseColor, 50);
          }
          this.ctx.fillStyle = baseColor;
          this.ctx.fillRect(x, y, width, height);
        }
      });
    }

    drawVerticalNotes(currentTime, hoveredNote) {
      const playheadY = this.canvas.height - this.config.keyboardHeight;
      notesData.forEach((note) => {
        const keyProps = this.getKeyProps(note.pitch);
        const y_top = playheadY - (note.start - currentTime) * this.config.pixelsPerSecond;
        const y_bottom = playheadY - (note.end - currentTime) * this.config.pixelsPerSecond;
        let y = y_bottom;
        let height = y_top - y_bottom;
        if (y < playheadY && y + height > 0) {
          if (y < 0) {
            height += y;
            y = 0;
          }
          if (y + height > playheadY) {
            height = playheadY - y;
          }
          if (height > 0) {
            const isNoteActive = note.start <= currentTime && note.end > currentTime;
            let baseColor = this.config.palette[note.track % this.config.palette.length] || "#808080";
            if (note === hoveredNote) {
              baseColor = adjustColor(baseColor, 50);
            }
            if (isNoteActive) {
              baseColor = adjustColor(baseColor, 50);
            }
            this.ctx.fillStyle = baseColor;
            this.ctx.fillRect(keyProps.x, y, keyProps.width, height);
          }
        }
      });
    }

    drawHighlights(activeNotes, hoveredNote) {
      const keyboardY = this.canvas.height - this.config.keyboardHeight;
      activeNotes.forEach((note) => {
        let trackColor = this.config.palette[note.track % this.config.palette.length] || "#808080";
        if (note === hoveredNote) {
          trackColor = adjustColor(trackColor, 50);
        }
        const highlightColor = adjustColor(trackColor, 50);
        this.ctx.fillStyle = highlightColor;
        const props = this.getKeyProps(note.pitch);
        let height = this.config.keyboardHeight;
        if (props.isBlack) {
          height *= 0.6;
        }
        this.ctx.fillRect(props.x, keyboardY, props.width, height);
      });
    }

    drawStaticBlackKeys(activeNotes) {
      const keyboardY = this.canvas.height - this.config.keyboardHeight;
      this.ctx.fillStyle = "black";
      const activeBlackPitches = new Set(activeNotes.map((n) => n.pitch).filter(this.isBlack));
      for (let p = this.keyboardPitchRange.min; p <= this.keyboardPitchRange.max; p++) {
        if (this.isBlack(p) && !activeBlackPitches.has(p)) {
          const props = this.getKeyProps(p);
          this.ctx.fillRect(props.x, keyboardY, props.width, this.config.keyboardHeight * 0.6);
        }
      }
    }

    drawPlayhead() {
      if (mode === "pianoroll") {
        this.ctx.fillStyle = this.config.playheadColor;
        this.ctx.fillRect(this.config.playheadPosition, 0, 2, this.canvas.height);
      } else {
        // waterfall
        const playheadY = this.canvas.height - this.config.keyboardHeight;
        this.ctx.strokeStyle = this.config.playheadColor;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(0, playheadY);
        this.ctx.lineTo(this.canvas.width, playheadY);
        this.ctx.stroke();
      }
    }

    drawLabels(labelsCtx) {
      labelsCtx.font = this.config.labelFont;
      labelsCtx.fillStyle = this.config.labelColor;
      labelsCtx.textAlign = "right";
      labelsCtx.textBaseline = "middle";
      for (let p = this.notePitchRange.min; p <= this.notePitchRange.max; p++) {
        if (p % 12 === 0) {
          const y = (this.notePitchRange.max - p) * this.config.noteHeight + this.config.noteHeight / 2;
          labelsCtx.fillText(`C${Math.floor(p / 12) - 1}`, this.config.labelWidth - 5, y);
        }
      }
    }

    drawStaticKeyboard(staticCtx, canvasHeight) {
      const keyboardY = canvasHeight - this.config.keyboardHeight;
      staticCtx.fillStyle = "white";
      staticCtx.fillRect(0, keyboardY, staticCtx.canvas.width, this.config.keyboardHeight);
      staticCtx.strokeStyle = "#aaa";
      staticCtx.lineWidth = 1;
      for (let p = this.keyboardPitchRange.min; p <= this.keyboardPitchRange.max; p++) {
        const props = this.getKeyProps(p);
        if (!props.isBlack) {
          staticCtx.strokeRect(props.x, keyboardY, props.width, this.config.keyboardHeight);
        }
      }
      staticCtx.fillStyle = "black";
      for (let p = this.keyboardPitchRange.min; p <= this.keyboardPitchRange.max; p++) {
        const props = this.getKeyProps(p);
        if (props.isBlack) {
          staticCtx.fillRect(props.x, keyboardY, props.width, this.config.keyboardHeight * 0.6);
        }
      }
      staticCtx.font = this.config.labelFont;
      staticCtx.fillStyle = this.config.labelColor;
      staticCtx.textAlign = "center";
      for (let p = this.keyboardPitchRange.min; p <= this.keyboardPitchRange.max; p++) {
        if (p % 12 === 0) {
          const props = this.getKeyProps(p);
          staticCtx.fillText(`C${Math.floor(p / 12) - 1}`, props.x + props.width / 2, keyboardY + this.config.keyboardHeight - 5);
        }
      }
    }
  }

  /**
   * Manages the audio element and playback state.
   */
  class MidiPlayer {
    constructor(audioData, onStateChange) {
      this.audio = new Audio();
      this.audio.src = audioData;
      this.isPlaying = false;
      this.onStateChange = onStateChange;

      this.audio.onplay = () => {
        this.isPlaying = true;
        this.onStateChange();
      };
      this.audio.onpause = () => {
        this.isPlaying = false;
        this.onStateChange();
      };
      this.audio.onended = () => {
        this.audio.currentTime = 0;
        this.audio.pause();
      };
      this.audio.ontimeupdate = () => {
        if (this.isPlaying) this.onStateChange();
      };
      this.audio.onloadedmetadata = () => this.onStateChange();
    }
    play() {
      this.audio.play();
    }
    pause() {
      this.audio.pause();
    }
    seek(time) {
      this.audio.currentTime = time;
      this.onStateChange();
    }
    setVolume(volume) {
      this.audio.volume = volume;
    }
    get currentTime() {
      return this.audio.currentTime;
    }
    get duration() {
      return this.audio.duration;
    }
    cleanup() {
      this.audio.pause();
      this.audio.src = "";
      this.audio.onplay = this.audio.onpause = this.audio.onended = this.audio.ontimeupdate = this.audio.onloadedmetadata = null;
    }
  }

  /**
   * Manages UI controls and their event listeners.
   */
  class UIController {
    constructor(container, player, renderer) {
      this.player = player;
      this.renderer = renderer;
      this.hoveredNote = null;

      this.playIconSVG = `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M 4.018 14 L 13.982 8 L 4.018 2 Z"></path></svg>`;
      this.pauseIconSVG = `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M 3 2 H 6 V 14 H 3 Z M 10 2 H 13 V 14 H 10 Z"></path></svg>`;

      this.playPauseBtn = container.querySelector(".play-pause-btn");
      this.progressBar = container.querySelector(".progress-bar");
      this.timeDisplay = container.querySelector(".time-display");
      this.volumeSlider = container.querySelector(".volume-slider");
      this.visualizerDiv = container.querySelector(".visualizer");

      this.setupControls();
      this.setupTooltip();
    }

    setupControls() {
      this.playPauseBtn.innerHTML = this.playIconSVG;
      this.playPauseBtn.onclick = () => (this.player.isPlaying ? this.player.pause() : this.player.play());
      this.progressBar.oninput = () => this.player.seek(this.progressBar.value);
      this.volumeSlider.oninput = () => this.player.setVolume(this.volumeSlider.value);
    }

    setupTooltip() {
      this.tooltip = document.createElement("div");
      Object.assign(this.tooltip.style, {
        position: "absolute",
        display: "none",
        padding: "8px",
        backgroundColor: "rgba(20, 20, 20, 0.85)",
        color: "white",
        borderRadius: "4px",
        fontSize: "12px",
        fontFamily: "monospace",
        pointerEvents: "none",
        zIndex: "100",
      });
      this.visualizerDiv.appendChild(this.tooltip);

      const mainCanvas = this.renderer.canvas;
      this.handleMouseMove = this.handleMouseMove.bind(this);
      this.handleMouseOut = this.handleMouseOut.bind(this);
      mainCanvas.addEventListener("mousemove", this.handleMouseMove);
      mainCanvas.addEventListener("mouseout", this.handleMouseOut);
    }

    handleMouseMove(event) {
      const rect = this.renderer.canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      this.hoveredNote = this.renderer.findNoteAt(mouseX, mouseY, this.player.currentTime);
      this.updateTooltip(this.hoveredNote, mouseX, mouseY);
    }

    handleMouseOut() {
      this.hoveredNote = null;
      this.updateTooltip(null);
    }

    update(player) {
      this.playPauseBtn.innerHTML = player.isPlaying ? this.pauseIconSVG : this.playIconSVG;
      this.progressBar.max = player.duration || 0;
      this.progressBar.value = player.currentTime;
      this.timeDisplay.textContent = `${formatTime(player.currentTime)} / ${formatTime(player.duration)}`;
    }

    updateTooltip(note, mouseX, mouseY) {
      if (note) {
        const trackColor = config.palette[note.track % config.palette.length] || "#808080";
        const duration = note.end - note.start;
        this.tooltip.style.display = "block";
        this.tooltip.innerHTML = `
                <div style="display: flex; align-items: center; margin-bottom: 5px; line-height: 1;">
                    <span style="width: 12px; height: 12px; background-color: ${trackColor}; border: 1px solid #fff; margin-right: 8px; flex-shrink: 0;"></span>
                    <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${trackNames[note.track]}</span>
                </div>
                <div style="margin-bottom: 2px;">Time: ${note.start.toFixed(2)}s - ${note.end.toFixed(2)}s (${duration.toFixed(2)}s)</div>
                <div>Note: ${note.name} | Velocity: ${note.velocity}</div>
            `;
        this.tooltip.style.left = `${mouseX + 20}px`;
        this.tooltip.style.top = `${mouseY + 20}px`;
      } else {
        this.tooltip.style.display = "none";
      }
    }

    cleanup() {
      const mainCanvas = this.renderer.canvas;
      mainCanvas.removeEventListener("mousemove", this.handleMouseMove);
      mainCanvas.removeEventListener("mouseout", this.handleMouseOut);
      this.playPauseBtn.onclick = null;
      this.progressBar.oninput = null;
      this.volumeSlider.oninput = null;
    }
  }

  /**
   * Main App Class that orchestrates everything.
   */
  class MidiVizApp {
    constructor() {
      this.animationFrameId = null;

      this.renderer = new MidiRenderer(container, config);
      this.player = new MidiPlayer(vizData.audioData, () => this.onPlayerStateChange());
      this.ui = new UIController(container, this.player, this.renderer);

      this.ui.update(this.player);
      this.renderer.draw(0, [], null);
    }

    onPlayerStateChange() {
      this.ui.update(this.player);
      if (this.player.isPlaying && !this.animationFrameId) {
        this.animationLoop();
      }
      if (!this.player.isPlaying) {
        // Need to redraw one last time when pausing or seeking
        this.animationLoop(false);
      }
    }

    animationLoop(loop = true) {
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      const activeNotes = notesData.filter((n) => this.player.currentTime >= n.start && this.player.currentTime < n.end);
      this.renderer.draw(this.player.currentTime, activeNotes, this.ui.hoveredNote);

      if (this.player.isPlaying && loop) {
        this.animationFrameId = requestAnimationFrame(this.animationLoop.bind(this));
      }
    }

    cleanup() {
      if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
      this.player.cleanup();
      this.ui.cleanup();
    }
  }

  // --- Main Execution ---
  const app = new MidiVizApp();
  window.midiVizInstances.push(app);
};
