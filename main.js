/* Internal parameters */
let useSPP = false; // Spectral Peak Picking (FFT + Gaussian Interpolation)
let useAC = false; // Autocorrelation
let useYin = true; // Yin Pitch Tracking
let volumeThreshold = 134; // Amplitude threshold for detecting sound/silence [0-255], 128 = silence
let nPitchValues = 5; // Number of pitches for pitch averaging logic

/* Web Audio API variables */
let audioContext = null;
let analyserNode = null;
let processNode = null;
let microphoneNode = null;
let gainNode = null;
let lowPassFilter1 = null;
let lowPassFilter2 = null;
let highPassFilter1 = null;
let highPassFilter2 = null;

/* Configurable parameters */
let lowestFreq = 30; // Minimum tune = 44100/1024 = 43.07Hz
let highestFreq = 4200; // Maximum tune C8 (4186.02 Hz)

/* Tune variables */
let twelfthRootOfTwo = 1.05946309435929526456182529; // 2^(1/12)
let otthRootOfTwo = 1.0005777895; // 2^(1/1200)
let refNoteLabels = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"];
let refFreq = 440;
let refNoteIndex = 0;
let noteFrequencies = [];
let noteLabels = [];
let pitchHistory = [];
let lastnote
let currentNote
let lastFrequency
/* GUI variables */
let pixelsPerCent = 3;
let silenceTimeout = null;
let minUpdateDelay = 100; // Pitch/GUI maximum update rate in milliseconds

// generateNoteBarCanvas();
if (window.requestAnimationFrame && window.AudioContext && navigator.getUserMedia) {
    try {
        navigator.getUserMedia({ audio: true }, gotStream, function (err) {
            console.log("DEBUG: Error getting microphone input: " + err);
        });
    } catch (e) {
        console.log("DEBUG: Couldn't get microphone input: " + e);
    }
}
else {
    console.log("DEBUG: Web Audio API is not supported");
}

function gotStream(stream) {
    initCore(stream);
}

function initCore(stream) {
    audioContext = new AudioContext();
    microphoneNode = audioContext.createMediaStreamSource(stream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048;
    analyserNode.smoothingTimeConstant = 0.8;
    gainNode = audioContext.createGain();
    gainNode.gain.value = 1.5; // Set mic volume to 150% by default
    lowPassFilter1 = audioContext.createBiquadFilter();
    lowPassFilter2 = audioContext.createBiquadFilter();
    highPassFilter1 = audioContext.createBiquadFilter();
    highPassFilter2 = audioContext.createBiquadFilter();
    lowPassFilter1.Q.value = 0;
    lowPassFilter1.frequency.value = highestFreq;
    lowPassFilter1.type = "lowpass";
    lowPassFilter2.Q.value = 0;
    lowPassFilter2.frequency.value = highestFreq;
    lowPassFilter2.type = "lowpass";
    highPassFilter1.Q.value = 0;
    highPassFilter1.frequency.value = lowestFreq;
    highPassFilter1.type = "highpass";
    highPassFilter2.Q.value = 0;
    highPassFilter2.frequency.value = lowestFreq;
    highPassFilter2.type = "highpass";
    microphoneNode.connect(lowPassFilter1);
    lowPassFilter1.connect(lowPassFilter2);
    lowPassFilter2.connect(highPassFilter1);
    highPassFilter1.connect(highPassFilter2);
    highPassFilter2.connect(gainNode);
    gainNode.connect(analyserNode);
    initGui();
}

function initGui() {
    defineNoteFrequencies();
    updatePitch();
}

function updatePitch(time) {
    var pitchInHz = 0.0;
    var volumeCheck = false;
    var maxVolume = 128;
    var inputBuffer = new Uint8Array(analyserNode.fftSize);
    analyserNode.getByteTimeDomainData(inputBuffer);

    // Check for volume on the first buffer quarter
    for (var i = 0; i < inputBuffer.length / 4; i++) {
        if (maxVolume < inputBuffer[i]) maxVolume = inputBuffer[i];
        if (!volumeCheck && inputBuffer[i] > volumeThreshold) {
            volumeCheck = true;
        }
    }

    if (volumeCheck) {
        pitchInHz = Yin_pitchEstimation(inputBuffer, audioContext.sampleRate)
    }
    // Acceptable pitches range from 44 - 3500hz
    // Pitch smoothing logic
    var allowedHzDifference = 5;
    if (pitchInHz != 0) {
        clearTimeout(silenceTimeout);
        silenceTimeout = null;
        if (pitchHistory.length >= nPitchValues) pitchHistory.shift();
        // Octave jumping fix: if current pitch is around twice the previous detected pitch, halve its value
        if (pitchHistory.length && Math.abs((pitchInHz / 2.0) - pitchHistory[pitchHistory.length - 1]) < allowedHzDifference) pitchInHz = pitchInHz / 2.0;
        pitchInHz = Math.round(pitchInHz * 10) / 10;
        pitchHistory.push(pitchInHz);
        // Take the pitch history median as the current pitch
        var sortedPitchHistory = pitchHistory.slice(0).sort(function (a, b) { return a - b });
        pitchInHz = sortedPitchHistory[Math.floor((sortedPitchHistory.length - 1) / 2)];

    /*
    // Take the pitch history mean as the current pitch
    pitchInHz = 0.0;
    for (var i=0; i<sortedPitchHistory.length; i++) pitchInHz += sortedPitchHistory[i];
    pitchInHz = Math.round(pitchInHz*10/sortedPitchHistory.length)/10;
    */
        updateGui(pitchInHz, getClosestNoteIndex(pitchInHz), (maxVolume - 128) / 128);
        if (pitchHistory.length < nPitchValues) window.requestAnimationFrame(updatePitch);
        else {
            setTimeout(function () {
                window.requestAnimationFrame(updatePitch);
            }, minUpdateDelay);
        }
    }
    else {
        if (silenceTimeout === null) {
            silenceTimeout = setTimeout(function () {
                pitchHistory = [];
                updateGui(0.0, false, 0);
            }, 500);
        }
        window.requestAnimationFrame(updatePitch);
    }
}

function updateGui(currentFreq, closestIndex, maxVolume) {
    if (closestIndex === false || currentFreq == 0) {
    }
    else {

        lastNote = currentNote
        currentNote = noteLabels[closestIndex]
        // Update UI
        document.getElementById('frequency').innerText = `${currentFreq}hz`
        document.getElementById('volume').innerText = `${maxVolume}`
        document.getElementById('lastNote').innerText = `Last note played: ${lastNote}`
        // let centDiff = getCentDiff(currentFreq, noteFrequencies[closestIndex]).toFixed(1);
        // We want a value from 50 - 100, inverted based on brightness
        // low volumes yield values closer to 95 (light), high volumes yield values closer 15 (dark)
        let temp = (maxVolume / 1 * 50)
        let lightness = 100 - temp

        /*  we convert to RGB from an HSL format because HSL allows us to more easily assign frequencies to colors,
            whereas RGB allows gradient transitions rather than shortest distance wheel transitions  */
        let rgb = hslToRgb(currentFreq % 360, 1, .5)
        document.getElementById('screen').style.backgroundColor = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`

        lastFrequency = currentFreq
    }
}

function findRefNoteIndex(noteLabel) {
    for (var i = 0; i < refNoteLabels.length; i++) {
        if (refNoteLabels[i] == noteLabel) return i;
    }
    return false;
}

function getClosestNoteIndex(f) {
    if (f == 0.0) return false;
    for (var i = 0; i < noteFrequencies.length; i++) {
        if (f < noteFrequencies[i]) {
            if (i > 0 && (noteFrequencies[i] - f > f - noteFrequencies[i - 1])) return i - 1;
            else return i;
        }
    }
    return false;
}

function getCentDiff(fCurrent, fRef) {
    return 1200 * Math.log(fCurrent / fRef) / Math.log(2);
}

function getSemituneDiff(fCurrent, fRef) {
    return 12 * Math.log(fCurrent / fRef) / Math.log(2);
}

function defineNoteFrequencies() {
    var noteFreq = 0.0;
    var greaterNoteFrequencies = [];
    var greaterNoteLabels = [];
    var lowerNoteFrequencies = [];
    var lowerNoteLabels = [];
    var octave = 4;

    for (var i = 0; ; i++) {
        if ((i + 9) % 12 == 0) octave++;
        noteFreq = refFreq * Math.pow(twelfthRootOfTwo, i);
        // maximum note tune C8 (4186.02 Hz)
        if (noteFreq > 4187) break;
        greaterNoteFrequencies.push(noteFreq);
        greaterNoteLabels.push(octave + refNoteLabels[(refNoteIndex + i) % refNoteLabels.length]);
    }

    octave = 4;
    for (var i = -1; ; i--) {
        if ((Math.abs(i) + 2) % 12 == 0) octave--;
        noteFreq = refFreq * Math.pow(twelfthRootOfTwo, i);
        // minimum note tune A0 (28Hz)
        if (noteFreq < 28) break;
        lowerNoteFrequencies.push(noteFreq);
        var relativeIndex = (refNoteIndex + i) % refNoteLabels.length;
        relativeIndex = (relativeIndex == 0) ? 0 : relativeIndex + (refNoteLabels.length);
        lowerNoteLabels.push(octave + refNoteLabels[relativeIndex]);
    }

    lowerNoteFrequencies.reverse();
    lowerNoteLabels.reverse();
    noteFrequencies = lowerNoteFrequencies.concat(greaterNoteFrequencies);
    noteLabels = lowerNoteLabels.concat(greaterNoteLabels);
}