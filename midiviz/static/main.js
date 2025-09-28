// ./midiviz/static/main.js

window.initMidiViz = function (container) {
  // --- Global Instance Registry for Cleanup ---
  if (!window.midiVizInstances) {
    window.midiVizInstances = [];
  }
  window.midiVizInstances.forEach((instance) => instance.cleanup());
  window.midiVizInstances = [];

  // --- 1. Data Extraction & Element Setup ---
  const vizData = JSON.parse(container.dataset.vizData.replace(/&quot;/g, '"'));
  const { mode, audioData, notesData, userConfig, manualHeight, minPitch, maxPitch, padding } = vizData;

  if (!container) return;
  const playPauseBtn = container.querySelector(".play-pause-btn");
  const progressBar = container.querySelector(".progress-bar");
  const timeDisplay = container.querySelector(".time-display");
  const volumeSlider = container.querySelector(".volume-slider");
  const audio = new Audio();
  audio.src = audioData;
  let isPlaying = false;
  let animationFrameId = null;

  // --- 2. Icons & Configuration ---
  const playIconSVG = `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M 4.018 14 L 13.982 8 L 4.018 2 Z"></path></svg>`;
  const pauseIconSVG = `<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M 3 2 H 6 V 14 H 3 Z M 10 2 H 13 V 14 H 10 Z"></path></svg>`;
  const defaultConfig = {
    noteHeight: 5,
    noteWidth: 16,
    pixelsPerSecond: 100,
    playheadPosition: 80,
    playheadColor: "black",
    noteColor: "royalblue",
    highlightColor: "gold",
    gridColor: "rgba(200, 200, 200, 0.6)",
    labelFont: "10px sans-serif",
    labelColor: "#333",
    labelWidth: 40,
    keyboardHeight: 60,
    verticalPitchRange: [21, 108],
  };
  const config = { ...defaultConfig, ...userConfig };
  const notePitchRange = { min: minPitch - padding, max: maxPitch + padding };
  const keyboardPitchRange = { min: config.verticalPitchRange[0], max: config.verticalPitchRange[1] };

  // --- 3. Helper Functions ---
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

  // NEW: Helper to map MIDI velocity (0-127) to a color lightness.
  // High velocity = original color (amount=0). Low velocity = much lighter color.
  function mapVelocityToColor(baseColor, velocity) {
    const maxLightenAmount = 70; // How light the quietest note can be
    const lightenAmount = Math.floor(maxLightenAmount * ((127 - velocity) / 127));
    return adjustColor(baseColor, lightenAmount);
  }

  const isBlack = (p) => [1, 3, 6, 8, 10].includes(p % 12);
  function getKeyProps(pitch, config, range) {
    const whiteKeyWidth = config.noteWidth;
    const isPBlack = isBlack(pitch);
    const whiteKeyPosMap = [0, 0.7, 1, 1.7, 2, 3, 3.7, 4, 4.7, 5, 5.7, 6];
    const octave = Math.floor(pitch / 12);
    const pitchClass = pitch % 12;
    const absolutePos = (octave * 7 + whiteKeyPosMap[pitchClass]) * whiteKeyWidth;
    const rangeOctave = Math.floor(range.min / 12);
    const rangePitchClass = range.min % 12;
    const rangeStartPos = (rangeOctave * 7 + whiteKeyPosMap[rangePitchClass]) * whiteKeyWidth;
    let x = absolutePos - rangeStartPos;
    let width = isPBlack ? whiteKeyWidth * 0.6 : whiteKeyWidth;
    return { x, width, isBlack: isPBlack };
  }

  // --- 4. Drawing Functions ---
  let canvas, ctx, staticCanvas, staticCtx;

  function drawHorizontal() {
    const currentTime = audio.currentTime;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scrollOffset = currentTime * config.pixelsPerSecond - config.playheadPosition;
    ctx.strokeStyle = config.gridColor;
    ctx.lineWidth = 1;
    for (let p = notePitchRange.min; p <= notePitchRange.max; p++) {
      if (p % 12 === 0) {
        const y = (notePitchRange.max - p) * config.noteHeight;
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(canvas.width, y + 0.5);
        ctx.stroke();
      }
    }
    notesData.forEach((note) => {
      const x = note.start * config.pixelsPerSecond - scrollOffset;
      const y = (notePitchRange.max - note.pitch) * config.noteHeight;
      const width = (note.end - note.start) * config.pixelsPerSecond;
      const height = config.noteHeight;
      if (x + width > 0 && x < canvas.width) {
        const isNoteActive = currentTime >= note.start && currentTime < note.end;
        const baseColor = isNoteActive ? config.highlightColor : config.noteColor;

        // UPDATED: Calculate color based on velocity
        const finalColor = mapVelocityToColor(baseColor, note.velocity);
        const lighterBorder = adjustColor(finalColor, 30);
        const darkerBorder = adjustColor(finalColor, -30);

        ctx.fillStyle = finalColor;
        ctx.fillRect(x, y, width, height);

        if (height > 1 && width > 1) {
          ctx.save();
          ctx.lineWidth = 1;
          ctx.strokeStyle = lighterBorder;
          ctx.beginPath();
          ctx.moveTo(x + width - 0.5, y + 0.5);
          ctx.lineTo(x + 0.5, y + 0.5);
          ctx.lineTo(x + 0.5, y + height - 0.5);
          ctx.stroke();
          ctx.strokeStyle = darkerBorder;
          ctx.beginPath();
          ctx.moveTo(x + 0.5, y + height - 0.5);
          ctx.lineTo(x + width - 0.5, y + height - 0.5);
          ctx.lineTo(x + width - 0.5, y + 0.5);
          ctx.stroke();
          ctx.restore();
        }
      }
    });
    ctx.fillStyle = config.playheadColor;
    ctx.fillRect(config.playheadPosition, 0, 2, canvas.height);
  }

  function drawLabels(labelsCtx, config, range) {
    labelsCtx.clearRect(0, 0, labelsCtx.canvas.width, labelsCtx.canvas.height);
    labelsCtx.font = config.labelFont;
    labelsCtx.fillStyle = config.labelColor;
    labelsCtx.textAlign = "right";
    labelsCtx.textBaseline = "middle";
    for (let p = range.min; p <= range.max; p++) {
      if (p % 12 === 0) {
        const y = (range.max - p) * config.noteHeight + config.noteHeight / 2;
        labelsCtx.fillText(`C${Math.floor(p / 12) - 1}`, config.labelWidth - 5, y);
      }
    }
  }

  function drawVertical() {
    const currentTime = audio.currentTime;
    const playheadY = canvas.height - config.keyboardHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const activeNotes = notesData.filter((n) => currentTime >= n.start && n.end > currentTime);
    drawHighlights(ctx, config, keyboardPitchRange, canvas.height, activeNotes);
    const keyboardY = canvas.height - config.keyboardHeight;
    ctx.fillStyle = "black";
    const activeBlackPitches = new Set(activeNotes.filter((n) => isBlack(n.pitch)).map((n) => n.pitch));
    for (let p = keyboardPitchRange.min; p <= keyboardPitchRange.max; p++) {
      if (isBlack(p) && !activeBlackPitches.has(p)) {
        const props = getKeyProps(p, config, keyboardPitchRange);
        ctx.fillRect(props.x, keyboardY, props.width, config.keyboardHeight * 0.6);
      }
    }
    notesData.forEach((note) => {
      const keyProps = getKeyProps(note.pitch, config, keyboardPitchRange);
      const y_top = playheadY - (note.start - currentTime) * config.pixelsPerSecond;
      const y_bottom = playheadY - (note.end - currentTime) * config.pixelsPerSecond;
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
          const isNoteActive = note.start <= currentTime && currentTime < note.end;
          const baseColor = isNoteActive ? config.highlightColor : config.noteColor;

          // UPDATED: Calculate color based on velocity
          const finalColor = mapVelocityToColor(baseColor, note.velocity);
          const lighterBorder = adjustColor(finalColor, 30);
          const darkerBorder = adjustColor(finalColor, -30);

          const x = keyProps.x;
          const width = keyProps.width;
          ctx.fillStyle = finalColor;
          ctx.fillRect(x, y, width, height);
          if (height > 1 && width > 1) {
            ctx.save();
            ctx.lineWidth = 1;
            ctx.strokeStyle = lighterBorder;
            ctx.beginPath();
            ctx.moveTo(x + width - 0.5, y + 0.5);
            ctx.lineTo(x + 0.5, y + 0.5);
            ctx.lineTo(x + 0.5, y + height - 0.5);
            ctx.stroke();
            ctx.strokeStyle = darkerBorder;
            ctx.beginPath();
            ctx.moveTo(x + 0.5, y + height - 0.5);
            ctx.lineTo(x + width - 0.5, y + height - 0.5);
            ctx.lineTo(x + width - 0.5, y + 0.5);
            ctx.stroke();
            ctx.restore();
          }
        }
      }
    });
    ctx.strokeStyle = config.playheadColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, playheadY);
    ctx.lineTo(canvas.width, playheadY);
    ctx.stroke();
  }

  function drawStaticKeyboard(staticCtx, config, range, canvasHeight) {
    const keyboardY = canvasHeight - config.keyboardHeight;
    staticCtx.clearRect(0, 0, staticCtx.canvas.width, staticCtx.canvas.height);
    staticCtx.fillStyle = "white";
    staticCtx.fillRect(0, keyboardY, staticCtx.canvas.width, config.keyboardHeight);
    staticCtx.strokeStyle = "#aaa";
    staticCtx.lineWidth = 1;
    for (let p = range.min; p <= range.max; p++) {
      const props = getKeyProps(p, config, range);
      if (!props.isBlack) {
        staticCtx.strokeRect(props.x, keyboardY, props.width, config.keyboardHeight);
      }
    }
    staticCtx.fillStyle = "black";
    for (let p = range.min; p <= range.max; p++) {
      const props = getKeyProps(p, config, range);
      if (props.isBlack) {
        staticCtx.fillRect(props.x, keyboardY, props.width, config.keyboardHeight * 0.6);
      }
    }
    staticCtx.font = config.labelFont;
    staticCtx.fillStyle = config.labelColor;
    staticCtx.textAlign = "center";
    for (let p = range.min; p <= range.max; p++) {
      if (p % 12 === 0) {
        const props = getKeyProps(p, config, range);
        staticCtx.fillText(`C${Math.floor(p / 12) - 1}`, props.x + props.width / 2, keyboardY + config.keyboardHeight - 5);
      }
    }
  }

  function drawHighlights(ctx, config, range, canvasHeight, activeNotes) {
    const keyboardY = canvasHeight - config.keyboardHeight;

    activeNotes.forEach((note) => {
      const props = getKeyProps(note.pitch, config, range);
      const x = props.x;
      const width = props.width;
      let y = keyboardY;
      let height = config.keyboardHeight;
      if (props.isBlack) {
        height *= 0.6;
      }

      // UPDATED: Calculate color based on velocity and remove globalAlpha
      const finalHighlightColor = mapVelocityToColor(config.highlightColor, note.velocity);
      const lighterBorder = adjustColor(finalHighlightColor, 30);
      const darkerBorder = adjustColor(finalHighlightColor, -30);

      ctx.fillStyle = finalHighlightColor;
      ctx.fillRect(x, y, width, height);

      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = lighterBorder;
      ctx.beginPath();
      ctx.moveTo(x + width - 0.5, y + 0.5);
      ctx.lineTo(x + 0.5, y + 0.5);
      ctx.lineTo(x + 0.5, y + height - 0.5);
      ctx.stroke();
      ctx.strokeStyle = darkerBorder;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, y + height - 0.5);
      ctx.lineTo(x + width - 0.5, y + height - 0.5);
      ctx.lineTo(x + width - 0.5, y + 0.5);
      ctx.stroke();
      ctx.restore();
    });
  }

  // --- 5. Canvas Setup ---
  if (mode === "horizontal") {
    const labelsCanvas = container.querySelector(".labels-canvas");
    canvas = container.querySelector(".piano-roll-canvas");
    const labelsCtx = labelsCanvas.getContext("2d");
    ctx = canvas.getContext("2d");
    const pitchSpan = notePitchRange.max - notePitchRange.min + 1;
    const canvasHeight = manualHeight || pitchSpan * config.noteHeight;
    labelsCanvas.height = canvasHeight;
    canvas.height = canvasHeight;
    labelsCanvas.width = config.labelWidth;
    canvas.width = container.querySelector(".visualizer").clientWidth - config.labelWidth;
    drawLabels(labelsCtx, config, notePitchRange);
  } else {
    staticCanvas = container.querySelector(".static-canvas");
    canvas = container.querySelector(".dynamic-canvas");
    staticCtx = staticCanvas.getContext("2d");
    ctx = canvas.getContext("2d");
    const firstKeyProps = getKeyProps(keyboardPitchRange.min, config, keyboardPitchRange);
    const lastKeyProps = getKeyProps(keyboardPitchRange.max, config, keyboardPitchRange);
    const canvasWidth = lastKeyProps.x + lastKeyProps.width - firstKeyProps.x;
    const canvasSize = { width: canvasWidth, height: manualHeight || 600 };
    staticCanvas.width = canvas.width = canvasSize.width;
    staticCanvas.height = canvas.height = canvasSize.height;
    drawStaticKeyboard(staticCtx, config, keyboardPitchRange, canvas.height);
  }

  // --- 6. Animation Loop & Main Draw Function ---
  const draw = mode === "vertical" ? drawVertical : drawHorizontal;
  const animationLoop = () => {
    draw();
    if (isPlaying) {
      animationFrameId = requestAnimationFrame(animationLoop);
    }
  };

  // --- 7. Event Listeners ---
  playPauseBtn.onclick = () => (isPlaying ? audio.pause() : audio.play());
  audio.onplay = () => {
    isPlaying = true;
    playPauseBtn.innerHTML = pauseIconSVG;
    animationLoop();
  };
  audio.onpause = () => {
    isPlaying = false;
    playPauseBtn.innerHTML = playIconSVG;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  };
  audio.onended = () => {
    audio.onpause();
    audio.currentTime = 0;
    draw();
  };
  audio.onloadedmetadata = () => {
    progressBar.max = audio.duration;
    timeDisplay.textContent = `${formatTime(0)} / ${formatTime(audio.duration)}`;
  };
  audio.ontimeupdate = () => {
    progressBar.value = audio.currentTime;
    timeDisplay.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
  };
  progressBar.oninput = () => {
    audio.currentTime = progressBar.value;
    if (!isPlaying) {
      draw();
    }
  };
  volumeSlider.oninput = () => {
    audio.volume = volumeSlider.value;
  };

  // --- 8. Initial State and Final Registration ---
  const cleanup = () => {
    audio.pause();
    audio.src = "";
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    playPauseBtn.onclick = null;
    audio.onplay = null;
    audio.onpause = null;
    audio.onended = null;
    audio.onloadedmetadata = null;
    audio.ontimeupdate = null;
    progressBar.oninput = null;
    volumeSlider.oninput = null;
  };
  window.midiVizInstances.push({ cleanup });

  playPauseBtn.innerHTML = playIconSVG;
  draw();
};
